from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8001/"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until="networkidle")
    page.locator("#login-phone").fill("13800138000")
    page.locator("#login-password").fill("123456")
    page.locator("#login-page form button[type=submit]").click()
    page.wait_for_selector("#main-app:not(.hidden)")

    attribute_payload = '\" autofocus onfocus="window.__xss_attribute=1'
    textarea_payload = '</textarea><img id="xss-probe" src=x onerror="window.__xss_html=1">'
    page.evaluate("payload => { window.__xss_attribute = 0; recordsFilter.search = payload; renderRecords(document.getElementById('main-content')); }", attribute_payload)
    assert page.locator("#records-search").get_attribute("value") == attribute_payload, "搜索词文本未原样保留"
    assert page.evaluate("window.__xss_attribute") == 0, "搜索词逃逸到事件属性"

    page.evaluate("payload => { communityFilter.search = payload; renderCommunity(document.getElementById('main-content')); }", attribute_payload)
    assert page.locator("#community-search").get_attribute("value") == attribute_payload, "社区搜索词文本未原样保留"
    assert page.evaluate("window.__xss_attribute") == 0, "社区搜索词逃逸到事件属性"

    page.evaluate("payload => { window.__xss_html = 0; localStorage.setItem('xingban_wandering_plan', JSON.stringify({places: payload})); showWanderingPlan(); }", textarea_payload)
    assert page.locator("#wander-places").input_value() == textarea_payload, "防走失预案文本未原样保留"
    assert page.locator("#xss-probe").count() == 0, "防走失预案逃逸到HTML元素"
    assert page.evaluate("window.__xss_html") == 0, "防走失预案执行了事件处理器"
    assert not errors, f"浏览器脚本异常: {errors}"

    browser.close()
    print("PASS browser XSS probes: record search, community search, wandering plan")

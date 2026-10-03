import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("XINGBAN_BASE_URL", "http://127.0.0.1:8001/")

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
    page.evaluate("""() => {
      window.__reportCalls = 0;
      apiRequest = async (url, method, data) => {
        if (url === '/community/reports' && method === 'POST') {
          window.__reportCalls += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,case_ref:'case-reliable-1',status:'open'};
        }
        return {success:true};
      };
      reportCommunityContent(1);
    }""")
    request_id = page.locator("#community-report-request-id").input_value()
    assert len(request_id) == 36 and request_id.count("-") == 4, "社区举报缺少稳定UUID"
    page.locator("#community-report-reason").select_option("privacy")
    page.locator("#community-report-details").fill("内容包含儿童身份信息")
    page.evaluate("() => { submitCommunityReport(1); submitCommunityReport(1); }")
    page.get_by_text("举报已提交，工单号", exact=False).wait_for()
    assert page.evaluate("window.__reportCalls") == 1, "快速重复点击发送了多次举报"

    page.evaluate("""() => {
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      reportCommunityContent(1);
    }""")
    page.locator("#community-report-reason").select_option("privacy")
    page.locator("#community-report-details").fill("断网期间填写的举报说明")
    page.locator("#community-report-button").click()
    assert page.get_by_text("未提交：当前网络已断开", exact=False).count() == 1
    assert page.locator("#community-report-details").input_value() == "断网期间填写的举报说明", "断网后丢失举报内容"
    assert page.evaluate("window.__reportCalls") == 1, "断网时仍发送了举报"
    assert not errors, f"社区举报可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS community report reliability UI: stable request id, double-click guard, truthful offline state, input preserved")

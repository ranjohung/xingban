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
      useMockMode = false;
      selectedChild = {id: 2};
      window.__sensitiveCalls = [];
      window.__dialHref = '';
      HTMLAnchorElement.prototype.click = function(){ window.__dialHref = this.href; };
      apiRequest = async (url, method, data) => {
        window.__sensitiveCalls.push({url, method, data});
        if (url === '/sensitive/record/emergency_contacts/2' && method === 'GET') return {success:true,resource:{data:{contacts:[{id:1,name:'外婆',fullPhone:'13800138002'}]}}};
        if (url === '/sensitive/record/safety_plan/2' && method === 'GET') return {success:false,error:'资源不存在'};
        if (method === 'PUT') return {success:true,id:'saved'};
        return {success:true};
      };
    }""")
    page.evaluate("() => showEmergencyContactManager()")
    page.get_by_text("外婆", exact=True).wait_for()
    assert page.get_by_text("138****8002", exact=True).count() == 1, "联系人电话未脱敏显示"
    assert page.get_by_text("13812348000", exact=True).count() == 0, "页面仍展示虚构可拨打联系人"
    page.locator("#new-contact-name").fill("爸爸")
    page.locator("#new-contact-phone").fill("139 0013 9003")
    page.get_by_role("button", name="添加联系人").click()
    page.wait_for_timeout(100)
    save_call = page.evaluate("window.__sensitiveCalls.find(x => x.url === '/sensitive/record/emergency_contacts/2' && x.method === 'PUT')")
    assert save_call and len(save_call["data"]["data"]["contacts"]) == 2, "联系人未按当前儿童加密保存"

    page.evaluate("() => callEmergencyContact('110', '报警')")
    assert page.evaluate("window.__dialHref") == "tel:110", "报警按钮没有触发真实tel拨号"
    page.evaluate("() => { window.__dialHref=''; callEmergencyContact('javascript:alert(1)', '错误'); }")
    assert page.evaluate("window.__dialHref") == "", "非法电话值进入tel协议"

    page.evaluate("() => showSafetyPlan()")
    page.locator("#safety-warning").wait_for()
    page.locator("#safety-warning").fill("连续两晚明显少睡")
    page.get_by_role("button", name="保存安全计划").click()
    page.wait_for_timeout(100)
    plan_call = page.evaluate("window.__sensitiveCalls.find(x => x.url === '/sensitive/record/safety_plan/2' && x.method === 'PUT')")
    assert plan_call and plan_call["data"]["data"]["warning"] == "连续两晚明显少睡", "安全计划仍写入固定儿童"
    assert not errors, f"敏感记录与联系人页面脚本异常: {errors}"
    browser.close()
    print("PASS sensitive records and contacts UI: current child, encrypted route, masked display, real tel link, invalid phone rejected")

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
      window.__emergencyStarts = 0;
      window.__emergencyEnds = 0;
      apiRequest = async (url, method, data) => {
        if (url === '/emergency/start' && method === 'POST') {
          window.__emergencyStarts += 1;
          window.__emergencyStartPayload = data;
          await new Promise(resolve => setTimeout(resolve, 500));
          return {success:true,session:{id:41,child_id:data.child_id,level:data.level}};
        }
        if (url === '/emergency/end/41' && method === 'POST') {
          window.__emergencyEnds += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,outcome:data.outcome};
        }
        return {success:true};
      };
      startEmergency('yellow');
      startEmergency('yellow');
    }""")
    page.locator("#breath-text").wait_for(timeout=300)
    assert "尚未保存" in page.locator("#emergency-session-status").inner_text(), "安全引导被服务端请求阻塞"
    page.get_by_text("本次支持已建立安全记录。", exact=True).wait_for()
    assert page.evaluate("window.__emergencyStarts") == 1, "连续点击重复启动紧急支持会话"
    payload = page.evaluate("window.__emergencyStartPayload")
    assert payload["child_id"] == 2, "紧急支持会话未关联当前儿童"
    assert len(payload["client_request_id"]) == 36, "紧急支持会话缺少幂等UUID"

    page.evaluate("() => { finishEmergencySession('yellow'); }")
    page.get_by_text("已平静", exact=True).click()
    page.evaluate("() => saveEmergencyOutcome('yellow', 'calm')")
    page.wait_for_timeout(250)
    assert page.evaluate("window.__emergencyEnds") == 1, "连续点击重复结束紧急支持会话"

    page.evaluate("""() => {
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      startEmergency('green');
    }""")
    page.get_by_text("本次会话尚未保存", exact=False).wait_for()
    assert page.evaluate("window.__emergencyStarts") == 1, "断网时仍发送紧急支持会话"
    assert not errors, f"紧急支持可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS emergency reliability UI: current child, start/end guards, stable request id, truthful offline guidance")

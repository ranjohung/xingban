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
      window.__shareCalls = 0;
      apiRequest = async (url, method, data) => {
        if (url === '/therapist/share' && method === 'POST') {
          window.__shareCalls += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,share:{id:876543,scope:data.scope,expires_days:data.expires_days}};
        }
        return {success:true};
      };
      showShareToTherapistModal(1);
    }""")
    request_id = page.locator("#share-request-id").input_value()
    assert len(request_id) == 36 and request_id.count("-") == 4, "分享请求缺少稳定UUID"
    page.locator("#share-consent").check()
    page.evaluate("() => { confirmShareReport(1); confirmShareReport(1); }")
    page.get_by_text("周报已分享给专业人员", exact=False).wait_for()
    assert page.evaluate("window.__shareCalls") == 1, "快速重复点击发出了多次分享请求"
    assert page.evaluate("reportShareRecords.filter(item => Number(item.id) === 876543).length") == 1, "前端生成重复授权"

    page.evaluate("""() => {
      useMockMode = false;
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      showShareToTherapistModal(1);
    }""")
    page.locator("#share-note").fill("断网期间填写的分享备注")
    page.locator("#share-consent").check()
    page.locator("#share-save-button").click()
    assert page.get_by_text("未分享：当前网络已断开", exact=False).count() == 1
    assert page.locator("#share-note").input_value() == "断网期间填写的分享备注", "断网失败后丢失分享设置"
    assert page.evaluate("window.__shareCalls") == 1, "断网时仍发送了分享请求"
    assert not errors, f"分享可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS report share reliability UI: stable request id, double-click guard, truthful offline state, input preserved")

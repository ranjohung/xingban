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
      window.__behaviorCalls = 0;
      apiRequest = async (url, method, data) => {
        if (url === '/behavior' && method === 'POST') {
          window.__behaviorCalls += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,record:{id:987654,child_id:data.child_id,input_type:data.input_type,ai_analysis:{}}};
        }
        if (url.startsWith('/strategy/recommend/')) return {success:true,strategies:[]};
        if (url.startsWith('/knowledge/')) return {success:false,error:'not connected'};
        return {success:true};
      };
      showNewRecord(1);
    }""")
    request_id = page.locator("#record-request-id").input_value()
    assert len(request_id) == 36 and request_id.count("-") == 4, "保存请求缺少稳定UUID"
    page.locator("#record-content").fill("活动转换前哭泣两分钟，家长减少语言后平静")
    page.evaluate("() => { saveRecord(); saveRecord(); }")
    page.get_by_text("记录已保存 · 下一步", exact=False).wait_for()
    assert page.evaluate("window.__behaviorCalls") == 1, "快速重复点击发出了多次保存请求"
    assert page.evaluate("MOCK_DATA.behaviors.filter(item => Number(item.id) === 987654).length") == 1, "前端生成重复记录"

    page.evaluate("""() => {
      closeTopModal();
      useMockMode = false;
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      showNewRecord(1);
    }""")
    page.locator("#record-content").fill("断网期间填写的观察记录")
    page.locator("#record-save-button").click()
    assert page.get_by_text("未保存：当前网络已断开", exact=False).count() == 1
    assert page.locator("#record-content").input_value() == "断网期间填写的观察记录", "断网失败后丢失家长输入"
    assert page.evaluate("window.__behaviorCalls") == 1, "断网时仍发送了保存请求"
    assert not errors, f"记录可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS record reliability UI: stable request id, double-click guard, truthful offline state, input preserved")

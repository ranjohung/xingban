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
      window.__childWrites = 0;
      window.__childPayload = null;
      apiRequest = async (url, method, data) => {
        if (url === '/child' && method === 'POST') {
          window.__childWrites += 1;
          window.__childPayload = data;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,child:{id:991,nickname:data.nickname,birth_date:data.birth_date,diagnosis_type:data.diagnosis_type}};
        }
        if (url === '/child' && method === 'GET') return {success:true,children:[]};
        return {success:true};
      };
      showNewChild();
    }""")
    request_id = page.locator("#child-request-id").input_value()
    assert len(request_id) == 36 and request_id.count("-") == 4, "儿童建档缺少稳定UUID"
    page.locator("#child-nickname").fill("小星")
    page.locator("#child-birthdate").fill("2020-01-02")
    page.locator("#child-sensory").select_option("visual_sensitive", force=True)
    page.locator("#child-consent").check()
    page.evaluate("() => { saveChild(); saveChild(); }")
    page.get_by_text("添加成功", exact=True).wait_for()
    assert page.evaluate("window.__childWrites") == 1, "快速重复点击创建了多份儿童档案"
    payload = page.evaluate("window.__childPayload")
    assert payload["communication_level"] == 3, "沟通支持等级未按表单提交"
    assert payload["sensory_visual"] == "sensitive" and payload["sensory_hearing"] == "unknown", "视觉敏感被错误写入听觉字段"

    page.evaluate("""() => {
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      showNewChild();
    }""")
    page.locator("#child-nickname").fill("断网时填写的小星")
    page.locator("#child-birthdate").fill("2020-01-02")
    page.locator("#child-consent").check()
    page.locator("#child-save-button").click()
    assert page.get_by_text("未保存：当前网络已断开", exact=False).count() == 1
    assert page.locator("#child-nickname").input_value() == "断网时填写的小星", "断网后丢失儿童资料"
    assert page.evaluate("window.__childWrites") == 1, "断网时仍发送了儿童建档请求"
    assert not errors, f"儿童建档可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS child creation reliability UI: stable request id, double-click guard, sensory mapping, offline draft preserved")

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
      window.__inviteCalls = 0;
      window.__promptedCode = '';
      window.prompt = (_message, value) => { window.__promptedCode = value; return value; };
      apiRequest = async (url, method, data) => {
        if (url === '/family/caregivers/invitations' && method === 'POST') {
          window.__inviteCalls += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,invitation:{id:'invite-1',child_id:data.child_id,permissions:data.permissions},invitation_code:'stable-secret-code'};
        }
        return {success:true};
      };
      const modal=document.createElement('div');modal.dataset.modal='true';modal.innerHTML='<div></div>';document.body.appendChild(modal);renderCaregiverAccessCenter(modal,[],[]);
    }""")
    request_id = page.locator("#caregiver-request-id").input_value()
    assert len(request_id) == 36 and request_id.count("-") == 4, "共同照护邀请缺少稳定UUID"
    page.locator("#caregiver-phone").fill("13900139000")
    page.evaluate("() => { createCaregiverInvitation(); createCaregiverInvitation(); }")
    page.get_by_text("邀请码已生成", exact=False).wait_for()
    assert page.evaluate("window.__inviteCalls") == 1, "快速重复点击创建了多次邀请"
    assert page.evaluate("window.__promptedCode") == "stable-secret-code", "未向家长显示可传递的邀请码"

    page.evaluate("""() => {
      document.querySelector('[data-modal]')?.remove();
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      const modal=document.createElement('div');modal.dataset.modal='true';modal.innerHTML='<div></div>';document.body.appendChild(modal);renderCaregiverAccessCenter(modal,[],[]);
    }""")
    page.locator("#caregiver-phone").fill("13900139000")
    page.locator("#caregiver-invite-button").click()
    assert page.get_by_text("未生成：当前网络已断开", exact=False).count() == 1
    assert page.locator("#caregiver-phone").input_value() == "13900139000", "断网后丢失邀请手机号"
    assert page.evaluate("window.__inviteCalls") == 1, "断网时仍发送了邀请请求"
    assert not errors, f"共同照护邀请可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS caregiver invitation reliability UI: stable request id, double-click guard, truthful offline state, input preserved")

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
      window.__practiceWrites = 0;
      window.confirm = () => true;
      apiRequest = async (url, method, data) => {
        if (url === '/safety/skills' && method === 'GET') return {success:true,skills:[{id:1,name:'停下并找成人',description:'成人陪同练习',difficulty:'简单'}]};
        if (url === '/safety/skills/1/practice' && method === 'POST') {
          window.__practiceWrites += 1;
          window.__practicePayload = data;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,record:{id:91,child_id:data.child_id,skill_id:1,completed:true}};
        }
        return {success:true};
      };
      showSafetySkills();
    }""")
    page.locator("#safety-practice-button-1").wait_for()
    request_id = page.locator("#safety-practice-request-1").input_value()
    assert len(request_id) == 36 and request_id.count("-") == 4, "安全练习缺少稳定UUID"
    page.evaluate("() => { practiceSkill(1); practiceSkill(1); }")
    page.get_by_text("已记录本次真实练习。", exact=True).wait_for()
    assert page.evaluate("window.__practiceWrites") == 1, "快速重复点击发送了多次练习记录"
    assert page.evaluate("window.__practicePayload.child_id") == 1, "练习记录未关联当前儿童"

    page.evaluate("""() => {
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      document.getElementById('safety-practice-request-1').value = newClientRequestId();
    }""")
    page.locator("#safety-practice-button-1").click()
    assert "未记录：当前网络已断开" in page.locator("#safety-practice-status-1").inner_text()
    assert page.evaluate("window.__practiceWrites") == 1, "断网时仍发送了练习记录"
    assert not errors, f"安全练习可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS safety practice reliability UI: stable request id, correct child, double-click guard, truthful offline state")

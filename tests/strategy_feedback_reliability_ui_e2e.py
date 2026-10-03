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
      window.__feedbackWrites = 0;
      apiRequest = async (url, method, data) => {
        if (url === '/strategy/feedback' && method === 'POST') {
          window.__feedbackWrites += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,feedback:{id:71,effectiveness:data.effectiveness,behavior_record_id:data.behavior_record_id}};
        }
        return {success:true};
      };
      currentInterventionContext={childId:1,behaviorRecordId:8,category:'活动转换'};
      showStrategyDetail(1);
    }""")
    page.locator("#strategy-feedback-note-1").wait_for()
    request_id = page.locator("#strategy-feedback-request-1").input_value()
    assert len(request_id) == 36 and request_id.count("-") == 4, "策略反馈缺少稳定UUID"
    page.locator("#strategy-feedback-note-1").fill("先预告后顺利转换")
    page.evaluate("() => { submitStrategyFeedback(1, 'positive'); submitStrategyFeedback(1, 'positive'); }")
    page.get_by_text("感谢反馈！已关联到本周周报", exact=True).wait_for()
    assert page.evaluate("window.__feedbackWrites") == 1, "快速重复点击发送了多次策略反馈"

    page.evaluate("""() => {
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      currentInterventionContext={childId:1,behaviorRecordId:8,category:'活动转换'};
      showStrategyDetail(1);
    }""")
    page.locator("#strategy-feedback-note-1").last.wait_for()
    page.locator("#strategy-feedback-note-1").last.fill("断网期间的孩子反应")
    page.locator(".strategy-feedback-button-1").last.click()
    assert page.get_by_text("未提交：当前网络已断开", exact=False).count() == 1
    assert page.locator("#strategy-feedback-note-1").last.input_value() == "断网期间的孩子反应", "断网后丢失策略反馈说明"
    assert page.evaluate("window.__feedbackWrites") == 1, "断网时仍发送了策略反馈"
    assert not errors, f"策略反馈可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS strategy feedback reliability UI: stable request id, double-click guard, truthful offline state, note preserved")

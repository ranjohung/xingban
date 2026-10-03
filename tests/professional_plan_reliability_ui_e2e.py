import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("XINGBAN_BASE_URL", "http://127.0.0.1:8001/")

def fill_plan(page, title):
    page.locator("#manual-plan-title").fill(title)
    page.locator("#manual-plan-goal").fill("孩子能在升级前表达暂停")
    page.locator("#manual-plan-frequency").fill("每天平静时练习一次")
    page.locator("#manual-plan-owner").fill("家长")
    page.locator("#manual-plan-stop").fill("出现明显不适或风险时停止并求助")
    page.locator("#manual-plan-review").fill("2026-10-20")

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
      window.__planCalls = 0;
      apiRequest = async (url, method, data) => {
        if (url === '/therapist/plans' && method === 'POST') {
          window.__planCalls += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,plan:{id:765432,...data,confirmation_status:data.therapist_id?'pending':'not_requested',version:1}};
        }
        return {success:true};
      };
      showManualProfessionalPlanEditor();
    }""")
    request_id = page.locator("#manual-plan-request-id").input_value()
    assert len(request_id) == 36 and request_id.count("-") == 4, "协作计划请求缺少稳定UUID"
    fill_plan(page, "转换支持计划")
    page.evaluate("() => { saveManualProfessionalPlan(); saveManualProfessionalPlan(); }")
    page.get_by_text("草稿已保存", exact=False).wait_for()
    assert page.evaluate("window.__planCalls") == 1, "快速重复点击发出了多次计划请求"
    assert page.evaluate("professionalActions.filter(item => Number(item.id) === 765432).length") == 1, "前端生成重复计划"

    page.evaluate("""() => {
      useMockMode = false;
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      showManualProfessionalPlanEditor();
    }""")
    fill_plan(page, "断网期间填写的协作计划")
    page.locator("#manual-plan-save-button").click()
    assert page.get_by_text("未提交：当前网络已断开", exact=False).count() == 1
    assert page.locator("#manual-plan-title").input_value() == "断网期间填写的协作计划", "断网失败后丢失计划内容"
    assert page.evaluate("window.__planCalls") == 1, "断网时仍发送了计划请求"
    assert not errors, f"协作计划可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS professional plan reliability UI: stable request id, double-click guard, truthful offline state, input preserved")

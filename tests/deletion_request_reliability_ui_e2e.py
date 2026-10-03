import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("XINGBAN_BASE_URL", "http://127.0.0.1:8001/")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_function("typeof apiRequest === 'function'")
    page.evaluate("""() => {
      window.__deletionCalls = 0;
      apiRequest = async (url, method, data) => {
        if (url === '/sensitive/deletion-requests' && method === 'POST') {
          window.__deletionCalls += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,shares_revoked:true,request:{id:'delete-1',scope:data.scope,status:'pending'}};
        }
        if (url === '/sensitive/deletion-requests/mine') return {success:true,requests:[]};
        return {success:true};
      };
      const trigger=document.createElement('button');trigger.dataset.uiCall='showDataDeletionRequestForm';document.body.appendChild(trigger);trigger.click();trigger.remove();
    }""")
    request_id = page.locator("#deletion-request-id").input_value()
    assert len(request_id) == 36 and request_id.count("-") == 4, "删除申请缺少稳定UUID"
    page.locator("#deletion-confirmation").fill("DELETE")
    page.evaluate("() => { const button=document.getElementById('deletion-save-button'); button.click(); button.click(); }")
    page.get_by_text("删除申请已提交", exact=False).wait_for()
    assert page.evaluate("window.__deletionCalls") == 1, "快速重复点击发送了多次删除申请"

    page.evaluate("""() => {
      document.querySelectorAll('[data-modal]').forEach(item => item.remove());
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      const trigger=document.createElement('button');trigger.dataset.uiCall='showDataDeletionRequestForm';document.body.appendChild(trigger);trigger.click();trigger.remove();
    }""")
    page.locator("#deletion-reason").fill("断网期间填写的删除原因")
    page.locator("#deletion-confirmation").fill("DELETE")
    page.locator("#deletion-save-button").click()
    assert page.get_by_text("未提交：当前网络已断开", exact=False).count() == 1
    assert page.locator("#deletion-reason").input_value() == "断网期间填写的删除原因", "断网后丢失删除申请内容"
    assert page.evaluate("window.__deletionCalls") == 1, "断网时仍发送了删除申请"
    assert not errors, f"删除申请可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS deletion request reliability UI: stable request id, double-click guard, truthful offline state, input preserved")

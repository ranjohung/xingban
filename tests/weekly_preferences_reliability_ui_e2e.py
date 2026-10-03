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
      window.__weeklyPreferenceWrites = 0;
      useMockMode = false;
      apiRequest = async (url, method, data) => {
        if (url === '/report/preferences' && method === 'GET') return {success:true,preference:{enabled:true,delivery_weekday:1,delivery_hour:8,timezone:'Asia/Shanghai'}};
        if (url === '/report/preferences' && method === 'PUT') {
          window.__weeklyPreferenceWrites += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,preference:data};
        }
        return {success:true};
      };
      showWeeklyReportPreferences();
    }""")
    page.locator("#weekly-pref-save").wait_for()
    page.locator("#weekly-pref-weekday").select_option("3")
    page.locator("#weekly-pref-hour").select_option("19")
    page.evaluate("() => { saveWeeklyReportPreferences(); saveWeeklyReportPreferences(); }")
    page.get_by_text("自动周报设置已保存", exact=True).wait_for()
    assert page.evaluate("window.__weeklyPreferenceWrites") == 1, "快速重复点击发送了多次周报设置请求"

    page.evaluate("""() => {
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      showWeeklyReportPreferences();
    }""")
    page.locator("#weekly-pref-save").wait_for()
    page.locator("#weekly-pref-weekday").select_option("5")
    page.locator("#weekly-pref-hour").select_option("21")
    page.locator("#weekly-pref-save").click()
    assert page.get_by_text("未保存：当前网络已断开", exact=False).count() == 1
    assert page.locator("#weekly-pref-weekday").input_value() == "5", "断网后丢失周报星期选择"
    assert page.locator("#weekly-pref-hour").input_value() == "21", "断网后丢失周报小时选择"
    assert page.evaluate("window.__weeklyPreferenceWrites") == 1, "断网时仍发送了周报设置请求"
    assert not errors, f"周报设置可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS weekly preferences reliability UI: double-click guard, truthful offline state, choices preserved")

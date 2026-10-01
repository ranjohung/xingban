from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8001/"
OUT = Path(__file__).resolve().parent / "artifacts"
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until="networkidle")
    if page.locator("#login-page:not(.hidden)").count():
        page.locator("#login-phone").fill("13800138000")
        page.locator("#login-password").fill("123456")
        page.locator("#login-page form button[type=submit]").click()
        page.wait_for_selector("#main-app:not(.hidden)")

    routes = [
        "home", "records", "emergency", "strategies", "knowledge", "worksheets", "dialogues", "profile",
        "children", "profile-detail", "reports", "family", "growth", "safety", "stories", "ai", "community",
        "notifications", "career", "finance", "therapist", "achievements", "peer", "settings"
    ]
    for route in routes:
        page.evaluate("route => navigateTo(route)", route)
        page.wait_for_timeout(100)
        title_text = page.locator("#page-title").inner_text() if page.locator("#page-title").count() else ""
        assert title_text.strip(), f"{route} 页面标题为空"
        assert page.locator("#main-content").inner_text().strip(), f"{route} 页面内容为空"
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 1, f"{route} 页面横向溢出 {overflow}px"
        unnamed = page.locator("#main-content button:visible").evaluate_all(
            "els => els.filter(el => !(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim()).length"
        )
        assert unnamed == 0, f"{route} 页面存在 {unnamed} 个无可访问名称的按钮"

    page.evaluate("navigateTo('therapist')")
    page.locator('button[onclick^="showProfessionalPlanEditor"]:visible').first.click()
    page.locator("#plan-goal").fill("孩子能在情绪升级前表达需要暂停")
    page.locator("#plan-frequency").fill("每天一次，在平静时练习")
    page.locator("#plan-owner").fill("家长")
    page.locator("#plan-stop").fill("孩子明显不适、冲突升级或出现安全风险")
    page.locator("#plan-review").fill("2026-10-15")
    page.locator("#plan-confirmed").check()
    page.locator('button[onclick^="saveProfessionalAction"]').click()
    page.wait_for_timeout(150)
    assert page.locator('button[onclick*="escalated"]').count() == 1, "完整计划未进入执行中状态或缺少升级求助操作"
    page.screenshot(path=str(OUT / "professional-plan-mobile.png"), full_page=True)

    page.evaluate("navigateTo('emergency')")
    page.wait_for_timeout(100)
    assert page.get_by_text("120", exact=False).count() >= 1, "紧急支持缺少120指引"
    page.screenshot(path=str(OUT / "emergency-mobile.png"), full_page=True)

    assert not errors, "浏览器脚本异常：" + " | ".join(errors)
    print(f"PASS mobile UI: {len(routes)} areas, no horizontal overflow or unnamed buttons, professional plan flow, emergency guidance")
    browser.close()

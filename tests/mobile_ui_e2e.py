from pathlib import Path
import os
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8001/"
OUT = Path(__file__).resolve().parent / "artifacts"
OUT.mkdir(exist_ok=True)
EXPECT_SERVER = os.environ.get("XINGBAN_EXPECT_SERVER") == "1"
EXPECT_COOKIE = os.environ.get("XINGBAN_EXPECT_COOKIE") == "1"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until="networkidle")
    if page.locator("#login-page:not(.hidden)").count():
        page.locator("#login-phone").fill(os.environ.get("XINGBAN_TEST_PHONE", "13800138000"))
        page.locator("#login-password").fill(os.environ.get("XINGBAN_TEST_PASSWORD", "123456"))
        page.locator("#login-page form button[type=submit]").click()
        page.wait_for_selector("#main-app:not(.hidden)")

    if EXPECT_SERVER:
        hydrated = page.evaluate("""() => ({
            mode: sessionDataMode,
            children: MOCK_DATA.children.map(item => item.name),
            behaviors: MOCK_DATA.behaviors.length,
            reports: MOCK_DATA.reports.length,
            feedback: strategyFeedbackHistory.length,
            plans: professionalActions.length,
            shares: reportShareRecords.length
        })""")
        assert hydrated["mode"] == "server", f"真实账号未进入服务端数据模式：{hydrated}"
        if EXPECT_COOKIE:
            assert page.evaluate("getToken()") is None, "Cookie模式不应向前端脚本暴露Bearer令牌"
            assert page.evaluate("document.cookie.includes('xingban_csrf=')"), "Cookie模式缺少可供请求头使用的CSRF令牌"
        assert hydrated["children"] == ["真机验收儿童"], f"儿童档案混入演示数据：{hydrated['children']}"
        assert hydrated["behaviors"] == 1, f"真实行为记录数量异常：{hydrated['behaviors']}"
        assert hydrated["reports"] == 1, f"真实周报数量异常：{hydrated['reports']}"
        assert hydrated["feedback"] == 1, f"真实策略反馈数量异常：{hydrated['feedback']}"
        assert hydrated["plans"] == 1, f"真实协作计划数量异常：{hydrated['plans']}"
        assert hydrated["shares"] == 0, f"真实周报授权数量异常：{hydrated['shares']}"
        assert page.get_by_text("已连接家庭数据", exact=True).count() == 1, "首页缺少真实数据来源标识"

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

    if not EXPECT_SERVER:
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

    if EXPECT_SERVER:
        page.evaluate("navigateTo('therapist')")
        assert page.get_by_text("等待对方确认", exact=False).count() >= 1, "家长端未显示专业确认状态"
        page.evaluate("handleLogout()")
        page.locator("#login-phone").fill(os.environ["XINGBAN_TEST_THERAPIST_PHONE"])
        page.locator("#login-password").fill(os.environ["XINGBAN_TEST_PASSWORD"])
        page.locator("#login-page form button[type=submit]").click()
        page.wait_for_selector("#main-app:not(.hidden)")
        page.evaluate("navigateTo('therapist')")
        page.get_by_text("确认本版本", exact=True).click()
        page.locator("#plan-review-note").fill("目标、频率和停止条件清楚，可以由家长决定是否开始。")
        page.locator('button[onclick^="submitPlanReview"]:visible').click()
        page.wait_for_timeout(150)
        assert page.get_by_text("已确认", exact=True).count() >= 1, "专业端确认结果未回写"

    if not EXPECT_SERVER:
        page.evaluate("navigateTo('community')")
        page.evaluate("showNewPost()")
        page.locator("#new-post-title").fill("现在很危险")
        page.locator("#new-post-content").fill("孩子说不想活并准备吞药")
        page.locator('button[onclick="createPost()"]:visible').click()
        page.wait_for_selector('button[onclick*="navigateTo(\'emergency\')"]:visible')
        assert page.locator("text=120/110").count() >= 1, "危机内容暂缓公开后缺少即时求助指引"
        page.screenshot(path=str(OUT / "community-crisis-hold-mobile.png"), full_page=True)
        page.locator('button[onclick*="navigateTo(\'community\')"]:visible').click()

        page.evaluate("reportCommunityContent(1)")
        page.locator("#community-report-reason").select_option("privacy")
        page.locator("#community-report-details").fill("帖子包含可识别的学校信息")
        page.locator('button[onclick^="submitCommunityReport"]:visible').click()
        page.wait_for_timeout(100)
        assert page.locator("#community-report-reason").count() == 0, "普通举报提交后弹窗未关闭"
        page.evaluate("showMyCommunityReports()")
        page.wait_for_timeout(100)
        assert page.locator('[data-modal="true"]:visible').inner_text().find("demo-") >= 0, "本人举报记录未显示可追踪工单号"
        page.evaluate("closeTopModal()")

    assert not errors, "浏览器脚本异常：" + " | ".join(errors)
    mode = "server hydration" if EXPECT_SERVER else "demo full flow"
    print(f"PASS mobile UI ({mode}): {len(routes)} areas, no horizontal overflow or unnamed buttons")
    browser.close()

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
      currentUser = { id: 501, role: 'admin', name: '界面测试管理员' };
      apiRequest = async url => {
        const history = url.includes('view=history');
        if (url.startsWith('/therapist/admin/profiles')) return { success:true, total:1, profiles:[{id:7,user_id:77,name:'测试专业人员',phone:'138****0000',email:'te***@example.com',professional_title:'儿童心理专业人员',specialty:'家庭支持',is_certified:history}] };
        if (url.startsWith('/therapist/admin/credentials')) return { success:true, total:1, credentials:[{id:'credential-test',therapist_id:7,therapist_name:'测试专业人员',credential_type:'license',issuing_authority:'测试儿童专业协会',expires_on:'2030-12-31',evidence_filename:'proof.pdf',evidence_sha256:'1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',status:history?'approved':'pending',submitted_by_user_id:999,first_reviewer_user_id:null,review_note:history?'两名管理员已分别核对原件':''}] };
        if (url.startsWith('/sensitive/admin/deletion-requests')) return {success:true,total:0,requests:[]};
        if (url.startsWith('/sensitive/admin/security-alerts')) return {success:true,total:0,alerts:[]};
        if (url.startsWith('/report/admin/jobs')) return {success:true,total:0,jobs:[]};
        if (url.startsWith('/community/moderation/reports')) return {success:true,total:0,reports:[]};
        return {success:false,error:'unexpected test URL '+url};
      };
      showSecurityOperations('active', 1);
    }""")
    page.get_by_text("等待第一人复核", exact=True).wait_for()
    assert page.get_by_text("提交人与两名复核人必须互不相同", exact=False).count() == 1
    assert page.locator("[data-admin-ops=true]").evaluate("el => el.scrollWidth - el.clientWidth") <= 1

    page.get_by_text("第一人通过", exact=True).click()
    assert page.get_by_text("请先下载并核对原文件", exact=False).count() == 1
    page.evaluate("closeTopModal()")
    page.get_by_text("提交新证据", exact=True).click()
    assert page.get_by_text("仅PDF、JPG或PNG，最大2MB", exact=False).count() == 1
    assert page.locator("#credential-file").get_attribute("accept") == "application/pdf,image/jpeg,image/png"
    page.evaluate("closeTopModal()")

    page.get_by_text("处理历史", exact=True).click()
    page.get_by_text("双人复核通过", exact=True).wait_for()
    assert page.get_by_text("两名管理员已分别核对原件", exact=False).count() == 1
    assert not errors, f"运营台脚本异常: {errors}"
    browser.close()
    print("PASS admin operations UI: credential evidence, two-review states, history and mobile layout")

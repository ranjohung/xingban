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
      window.__postCalls = 0;
      window.__commentCalls = 0;
      apiRequest = async (url, method, data) => {
        if (url === '/community/posts' && method === 'POST') {
          window.__postCalls += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,post:{id:91,title:data.title,content:data.content,category:data.category}};
        }
        if (url === '/community/posts/91' && method === 'GET') return {success:true,post:{id:91,title:'测试帖子',content:'内容',category:'question',likes:0,comments_count:0}};
        if (url === '/community/posts/91/comments' && method === 'GET') return {success:true,comments:[]};
        if (url === '/community/posts/91/comments' && method === 'POST') {
          window.__commentCalls += 1;
          await new Promise(resolve => setTimeout(resolve, 150));
          return {success:true,replayed:false,comment:{id:31,post_id:91,content:data.content}};
        }
        if (url === '/community/posts' && method === 'GET') return {success:true,posts:[],pagination:{page:1,total:0}};
        return {success:true};
      };
      showNewPost();
    }""")
    post_id = page.locator("#new-post-request-id").input_value()
    assert len(post_id) == 36 and post_id.count("-") == 4, "社区帖子缺少稳定UUID"
    page.locator("#new-post-title").fill("转换支持")
    page.locator("#new-post-content").fill("不包含身份信息的家庭观察")
    page.evaluate("() => { createPost(); createPost(); }")
    page.get_by_text("发布成功！", exact=True).wait_for()
    assert page.evaluate("window.__postCalls") == 1, "快速重复点击发送了多次帖子"

    page.evaluate("""() => {
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false });
      showNewPost();
    }""")
    page.locator("#new-post-title").fill("断网标题")
    page.locator("#new-post-content").fill("断网期间填写的帖子内容")
    page.locator("#new-post-button").click()
    assert page.get_by_text("未发布：当前网络已断开", exact=False).count() == 1
    assert page.locator("#new-post-content").input_value() == "断网期间填写的帖子内容", "断网后丢失帖子内容"
    assert page.evaluate("window.__postCalls") == 1, "断网时仍发送了帖子"
    page.evaluate("""() => {
      closeTopModal();
      Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => true });
      showPostDetail(91);
    }""")
    page.locator("#comment-input-91").wait_for()
    comment_id = page.locator("#comment-request-id-91").input_value()
    assert len(comment_id) == 36 and comment_id.count("-") == 4, "社区评论缺少稳定UUID"
    page.locator("#comment-input-91").fill("支持性评论")
    page.evaluate("() => { addComment(91); addComment(91); }")
    page.get_by_text("评论成功", exact=True).wait_for()
    assert page.evaluate("window.__commentCalls") == 1, "快速重复点击发送了多次评论"

    page.locator("#comment-input-91").wait_for()
    page.evaluate("() => Object.defineProperty(navigator, 'onLine', { configurable:true, get: () => false })")
    page.locator("#comment-input-91").fill("断网期间填写的评论")
    page.locator("#comment-button-91").click()
    assert page.get_by_text("未发送：当前网络已断开", exact=False).count() == 1
    assert page.locator("#comment-input-91").input_value() == "断网期间填写的评论", "断网后丢失评论"
    assert page.evaluate("window.__commentCalls") == 1, "断网时仍发送了评论"
    assert not errors, f"社区内容可靠性页面脚本异常: {errors}"
    browser.close()
    print("PASS community content reliability UI: stable request ids, double-click guards, truthful offline state, drafts preserved")

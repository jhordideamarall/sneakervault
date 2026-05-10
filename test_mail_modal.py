from playwright.sync_api import sync_playwright
import time

def test_mail_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()
        
        # Capture console logs
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
        
        try:
            print("Navigating to login page...")
            page.goto('http://localhost:3000/login', wait_until='networkidle')
            
            print(f"Current URL: {page.url}")
            page.screenshot(path='login_page.png')
            
            print("Logging in...")
            page.fill('input[type="email"]', 'owner@sneakervault.com')
            page.fill('input[type="password"]', 'owner123456')
            page.click('button[type="submit"]')
            
            print("Waiting for navigation...")
            # Wait for either overview or some other dashboard indicator
            try:
                page.wait_for_url('**/overview', timeout=10000)
            except:
                print(f"Failed to reach overview. Current URL: {page.url}")
                page.screenshot(path='login_failed.png')
                
            page.wait_for_load_state('networkidle')
            time.sleep(2)
            
            print("Dashboard loaded. Taking screenshot of dashboard...")
            page.screenshot(path='dashboard_before.png')
            
            print("Pressing 'm' key...")
            page.keyboard.press('m')
            time.sleep(2)
            
            print("Taking screenshot after pressing 'm'...")
            page.screenshot(path='dashboard_after_m.png')
            
            # Check if dialog is in DOM
            dialog = page.locator('[role="dialog"]')
            if dialog.count() > 0:
                print(f"Dialog element found in DOM. Count: {dialog.count()}")
                for i in range(dialog.count()):
                    d = dialog.nth(i)
                    print(f"Dialog {i} is visible: {d.is_visible()}")
                    style = d.evaluate('el => ({ opacity: window.getComputedStyle(el).opacity, display: window.getComputedStyle(el).display, zIndex: window.getComputedStyle(el).zIndex })')
                    print(f"Dialog {i} style: {style}")
            else:
                print("Dialog element NOT found in DOM.")
                # Maybe it's a popover or something else?
                popover = page.locator('[data-state="open"]')
                print(f"Open elements: {popover.count()}")
                
        except Exception as e:
            print(f"An error occurred: {e}")
            page.screenshot(path='error_screenshot.png')
        finally:
            browser.close()

if __name__ == "__main__":
    test_mail_modal()

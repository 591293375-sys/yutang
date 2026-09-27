#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#import <objc/runtime.h>
#include <node_api.h>
#include <cstring>

static char originalWindowStyleKey;

// Electron documents getNativeWindowHandle() as NSView* on macOS.
// Node-API keeps this tiny addon independent of Electron's V8 ABI.
static napi_value SetDesktopLevel(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  bool isBuffer = false, enabled = false;
  if (argc != 2 || napi_is_buffer(env, argv[0], &isBuffer) != napi_ok || !isBuffer ||
      napi_get_value_bool(env, argv[1], &enabled) != napi_ok) {
    napi_throw_type_error(env, nullptr, "Expected a native window Buffer and a boolean.");
    return nullptr;
  }
  void *bytes = nullptr;
  size_t length = 0;
  napi_get_buffer_info(env, argv[0], &bytes, &length);
  if (length != sizeof(void *) || ![NSThread isMainThread]) {
    napi_throw_error(env, nullptr, "Window level must be changed on the main thread with a valid handle.");
    return nullptr;
  }
  void *pointer = nullptr;
  std::memcpy(&pointer, bytes, sizeof(pointer));
  if (!pointer) {
    napi_throw_error(env, nullptr, "Empty native window handle.");
    return nullptr;
  }
  NSView *view = (__bridge NSView *)pointer;
  NSWindow *window = view.window;
  if (!window) {
    napi_throw_error(env, nullptr, "The native view has no window.");
    return nullptr;
  }
  // A titled NSWindow is constrained below the menu bar even at desktop level.
  // Remove its frame only while it is wallpaper; restore the public style mask
  // before Electron restores resizing, traffic lights and normal window bounds.
  NSNumber *originalStyle = objc_getAssociatedObject(window, &originalWindowStyleKey);
  if (enabled) {
    if (!originalStyle) objc_setAssociatedObject(window, &originalWindowStyleKey,
      @(window.styleMask), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    window.styleMask = NSWindowStyleMaskBorderless;
  } else if (originalStyle) {
    window.styleMask = (NSWindowStyleMask)originalStyle.unsignedIntegerValue;
    objc_setAssociatedObject(window, &originalWindowStyleKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  // Above wallpaper, below desktop icons and all ordinary application windows.
  window.level = enabled ? CGWindowLevelForKey(kCGDesktopWindowLevelKey) + 1 : NSNormalWindowLevel;
  if (enabled) {
    // Electron constrains normal-window y coordinates below the menu bar.
    // At desktop level, fill the actual primary display including that area.
    NSScreen *primary = NSScreen.screens.firstObject;
    if (primary) [window setFrame:primary.frame display:YES];
    [window orderBack:nil];
  }
  napi_value result;
  napi_create_int32(env, (int32_t)window.level, &result);
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "setDesktopLevel", NAPI_AUTO_LENGTH, SetDesktopLevel, nullptr, &fn);
  napi_set_named_property(env, exports, "setDesktopLevel", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

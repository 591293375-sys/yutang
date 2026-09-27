import Cocoa
import CoreGraphics
import Foundation
import Darwin

// A mouse-only passive listener. No keyboard events, event suppression,
// screen capture, accessibility element inspection, or persistent event logs.
// Permission is requested by the parent app only after an explicit user toggle.
func emit(_ json: String) {
    FileHandle.standardOutput.write(Data((json + "\n").utf8))
}

var eventTap: CFMachPort?
let mask = CGEventMask(1) << CGEventType.leftMouseDown.rawValue
eventTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .tailAppendEventTap,
    options: .listenOnly,
    eventsOfInterest: mask,
    callback: { _, type, event, _ in
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
        } else if type == .leftMouseDown {
            let point = event.location
            emit("{\"event\":\"click\",\"x\":\(point.x),\"y\":\(point.y)}")
        }
        return Unmanaged.passUnretained(event)
    },
    userInfo: nil
)

guard let tap = eventTap else {
    emit("{\"event\":\"denied\"}")
    exit(2)
}
let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
emit("{\"event\":\"ready\"}")
// Do not leave an input listener behind if the parent process crashes.
Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    if getppid() == 1 { exit(0) }
}
CFRunLoopRun()

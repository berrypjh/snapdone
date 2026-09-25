// 텍스트 파일을 PNG로 그린다. 사용: render <text-file> <out.png> [width] [height] [font-size]
import Foundation
import CoreGraphics
import CoreText
import ImageIO

let args = CommandLine.arguments
let text = try! String(contentsOfFile: args[1], encoding: .utf8)
let w = args.count > 3 ? Int(args[3])! : 720
let h = args.count > 4 ? Int(args[4])! : 960
let size = args.count > 5 ? Double(args[5])! : 30
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
let font = CTFontCreateWithName("AppleSDGothicNeo-Regular" as CFString, size, nil)
let attrs: [NSAttributedString.Key: Any] = [
    NSAttributedString.Key(kCTFontAttributeName as String): font,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1),
]
var y = Double(h) - size * 1.6
for raw in text.split(separator: "\n", omittingEmptySubsequences: false) {
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: String(raw), attributes: attrs))
    ctx.textPosition = CGPoint(x: size, y: y)
    CTLineDraw(line, ctx)
    y -= size * 1.5
}
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
CGImageDestinationFinalize(dest)

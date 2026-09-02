import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// Renders media/icon.png with Core Graphics so the repository carries generated
// art, not hand-made binaries. Run from the package root:
//
//   swift scripts/icon.swift            # media/icon.png (256 px)
//   swift scripts/icon.swift --sheet    # also a legibility sheet at 16–256 px
//
// The mark: three commits on a git rail, the lit one carrying its line into a
// gold commit node with the blame annotation hanging from it as an evidence tag.

func rgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(
        red: CGFloat((hex >> 16) & 0xff) / 255,
        green: CGFloat((hex >> 8) & 0xff) / 255,
        blue: CGFloat(hex & 0xff) / 255,
        alpha: alpha
    )
}

let bodyTop = rgb(0x241E3C)
let bodyBottom = rgb(0x120F1F)

func makeContext(_ size: Int) -> CGContext {
    let context = CGContext(
        data: nil,
        width: size,
        height: size,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    context.interpolationQuality = .high
    context.setAllowsAntialiasing(true)
    context.setShouldAntialias(true)
    return context
}

// The mark: three commits on a git rail. The lit commit carries its code line,
// which ends in the gold commit node, and the blame annotation hangs from that
// node as an evidence tag. Geometry is in 256-unit design space, y-down like the
// canvas sketch, and flipped once when drawing.
let railColor = rgb(0x4A4563)
let dimColor = rgb(0x6B6588)
let codeColor = rgb(0xECE7F7)
let amber = rgb(0xF6C177)

struct P {
    let x: CGFloat
    let y: CGFloat
}

func drawIcon(size: CGFloat) -> CGImage {
    let context = makeContext(Int(size))
    let canvas = CGRect(x: 0, y: 0, width: size, height: size)
    let body = canvas.insetBy(dx: size * 0.04, dy: size * 0.04)
    let radius = body.width * 0.22
    let shape = CGPath(roundedRect: body, cornerWidth: radius, cornerHeight: radius, transform: nil)

    context.saveGState()
    context.addPath(shape)
    context.clip()
    let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [bodyTop, bodyBottom] as CFArray,
        locations: [0, 1]
    )!
    context.drawLinearGradient(
        gradient,
        start: CGPoint(x: body.minX, y: body.maxY),
        end: CGPoint(x: body.maxX, y: body.minY),
        options: []
    )

    // design space: 256 units, y down
    let u = size / 256
    context.translateBy(x: 0, y: size)
    context.scaleBy(x: u, y: -u)
    context.setLineCap(.round)
    context.setLineJoin(.round)

    func rounded(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ color: CGColor) {
        context.setFillColor(color)
        context.addPath(CGPath(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerWidth: h / 2, cornerHeight: h / 2, transform: nil))
        context.fillPath()
    }
    func node(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ color: CGColor) {
        context.setFillColor(bodyBottom)
        context.fillEllipse(in: CGRect(x: x - r - 5, y: y - r - 5, width: (r + 5) * 2, height: (r + 5) * 2))
        context.setFillColor(color)
        context.fillEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
    }

    // rail and its commits
    context.setStrokeColor(railColor)
    context.setLineWidth(10)
    context.move(to: CGPoint(x: 52, y: 72))
    context.addLine(to: CGPoint(x: 52, y: 148))
    context.strokePath()

    rounded(72, 63, 104, 18, codeColor)
    rounded(72, 101, 56, 12, railColor)
    node(52, 72, 11, codeColor)
    node(52, 107, 11, dimColor)
    node(52, 148, 11, dimColor)

    // string from the gold node down to the tag's hole
    context.setStrokeColor(dimColor)
    context.setLineWidth(4)
    context.move(to: CGPoint(x: 176, y: 72))
    context.addCurve(to: CGPoint(x: 126, y: 152), control1: CGPoint(x: 214, y: 86), control2: CGPoint(x: 132, y: 124))
    context.strokePath()
    node(176, 72, 12, amber)

    // the evidence tag, tilted, hole on its left end
    let tagCentre = CGPoint(x: 164, y: 172)
    context.saveGState()
    context.translateBy(x: tagCentre.x, y: tagCentre.y)
    context.rotate(by: 12 * .pi / 180)
    context.translateBy(x: -tagCentre.x, y: -tagCentre.y)
    let tagRect = CGRect(x: tagCentre.x - 66, y: tagCentre.y - 30, width: 132, height: 60)
    context.setFillColor(amber)
    context.addPath(CGPath(roundedRect: tagRect, cornerWidth: 12, cornerHeight: 12, transform: nil))
    context.fillPath()
    context.setFillColor(bodyBottom)
    context.fillEllipse(in: CGRect(x: tagRect.minX + 18 - 7, y: tagCentre.y - 7, width: 14, height: 14))
    rounded(tagRect.minX + 36, tagRect.minY + 16, 76, 9, rgb(0x120F1F, 0.55))
    rounded(tagRect.minX + 36, tagRect.minY + 35, 48, 9, rgb(0x120F1F, 0.35))
    context.restoreGState()

    context.restoreGState()
    return context.makeImage()!
}

func writePNG(_ image: CGImage, to url: URL) {
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        FileHandle.standardError.write("failed to write \(url.path)\n".data(using: .utf8)!)
        exit(1)
    }
}

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let media = root.appendingPathComponent("media")
try FileManager.default.createDirectory(at: media, withIntermediateDirectories: true)
writePNG(drawIcon(size: 256), to: media.appendingPathComponent("icon.png"))
print("==> wrote media/icon.png")

if CommandLine.arguments.contains("--sheet") {
    let sizes: [CGFloat] = [16, 24, 32, 48, 64, 128, 256]
    let padding: CGFloat = 24
    let width = sizes.reduce(padding) { $0 + $1 + padding }
    let height = (sizes.max() ?? 256) + padding * 2
    let sheetContext = CGContext(
        data: nil, width: Int(width), height: Int(height), bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    sheetContext.interpolationQuality = .high
    sheetContext.setFillColor(rgb(0x2B2B2B))
    sheetContext.fill(CGRect(x: 0, y: 0, width: width, height: height))
    var x = padding
    for size in sizes {
        let image = drawIcon(size: size)
        sheetContext.draw(image, in: CGRect(x: x, y: (height - size) / 2, width: size, height: size))
        x += size + padding
    }
    let out = URL(fileURLWithPath: CommandLine.arguments.last(where: { $0.hasSuffix(".png") }) ?? "/tmp/gitective-icon-sheet.png")
    writePNG(sheetContext.makeImage()!, to: out)
    print("==> wrote \(out.path)")
}

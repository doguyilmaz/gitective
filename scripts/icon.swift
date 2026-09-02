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
// The mark: the feature itself. Code lines on a git rail; the current line is
// lit and carries its amber blame annotation, its commit node filled on the rail.

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

// The mark is the feature itself: three lines of code on a git rail, the
// current line lit, with its blame annotation trailing in amber and its commit
// node filled on the rail. Everything else stays muted so the annotation is
// the hero at every size.
let railColor = rgb(0x4A4563)
let dimColor = rgb(0x6B6588)
let codeColor = rgb(0xECE7F7)
let annotationColor = rgb(0xF6C177)

struct Row {
    let y: CGFloat          // fraction of the side, y-up
    let codeEnd: CGFloat    // fraction of the side
    let lit: Bool
}

let rows: [Row] = [
    Row(y: 0.70, codeEnd: 0.71, lit: false),
    Row(y: 0.50, codeEnd: 0.55, lit: true),
    Row(y: 0.30, codeEnd: 0.64, lit: false),
]
let railX: CGFloat = 0.20
let codeStart: CGFloat = 0.31
let annotationStart: CGFloat = 0.615
let annotationEnd: CGFloat = 0.815
let barHeight: CGFloat = 0.092

func bar(_ context: CGContext, size: CGFloat, y: CGFloat, from: CGFloat, to: CGFloat, color: CGColor) {
    let h = size * barHeight
    let rect = CGRect(x: size * from, y: size * y - h / 2, width: size * (to - from), height: h)
    context.setFillColor(color)
    context.addPath(CGPath(roundedRect: rect, cornerWidth: h / 2, cornerHeight: h / 2, transform: nil))
    context.fillPath()
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

    // a soft amber wash behind the lit row, the way the editor highlights the current line
    let lit = rows.first { $0.lit }!
    let washHeight = size * 0.19
    let wash = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [rgb(0xF6C177, 0), rgb(0xF6C177, 0.10), rgb(0xF6C177, 0)] as CFArray,
        locations: [0, 0.5, 1]
    )!
    context.saveGState()
    context.clip(to: CGRect(x: body.minX, y: size * lit.y - washHeight / 2, width: body.width, height: washHeight))
    context.drawLinearGradient(
        wash,
        start: CGPoint(x: body.minX, y: size * lit.y),
        end: CGPoint(x: body.maxX, y: size * lit.y),
        options: []
    )
    context.restoreGState()

    // the git rail with one node per line
    let railWidth = size * 0.032
    context.setFillColor(railColor)
    context.addPath(CGPath(
        roundedRect: CGRect(x: size * railX - railWidth / 2, y: size * 0.24, width: railWidth, height: size * 0.52),
        cornerWidth: railWidth / 2, cornerHeight: railWidth / 2, transform: nil
    ))
    context.fillPath()

    let nodeRadius = size * 0.048
    for row in rows {
        let centre = CGPoint(x: size * railX, y: size * row.y)
        // dark ring separates the node from the rail
        context.setFillColor(bodyBottom)
        context.fillEllipse(in: CGRect(
            x: centre.x - nodeRadius - size * 0.018, y: centre.y - nodeRadius - size * 0.018,
            width: (nodeRadius + size * 0.018) * 2, height: (nodeRadius + size * 0.018) * 2
        ))
        context.setFillColor(row.lit ? annotationColor : dimColor)
        context.fillEllipse(in: CGRect(
            x: centre.x - nodeRadius, y: centre.y - nodeRadius,
            width: nodeRadius * 2, height: nodeRadius * 2
        ))
    }

    for row in rows {
        bar(context, size: size, y: row.y, from: codeStart, to: row.codeEnd, color: row.lit ? codeColor : dimColor)
        if row.lit {
            bar(context, size: size, y: row.y, from: annotationStart, to: annotationEnd, color: annotationColor)
        }
    }

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
    let out = URL(fileURLWithPath: CommandLine.arguments.last(where: { $0.hasSuffix(".png") }) ?? "/tmp/whodunit-icon-sheet.png")
    writePNG(sheetContext.makeImage()!, to: out)
    print("==> wrote \(out.path)")
}

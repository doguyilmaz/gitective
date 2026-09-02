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
// The mark: a fingerprint whose ridges are git-style commit arcs, with the
// identifying commit node at the core. "Who touched this line."

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
let ridgeColor = rgb(0xF6C177)
let ridgeDeepColor = rgb(0xE9A85B)
let coreColor = rgb(0xFFD79A)

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

struct Ridge {
    let radius: CGFloat             // fraction of the side
    let drop: CGFloat               // how far this ridge's centre sits below the core
    let spans: [(CGFloat, CGFloat)] // degrees, counter-clockwise from 3 o'clock
}

// A loop print: nested arches opening at the bottom, each ridge's centre a little
// lower than the last so the gaps widen over the crown and the tails hang down.
// One ridge carries a break, the way real prints do.
let ridges: [Ridge] = [
    Ridge(radius: 0.092, drop: 0.000, spans: [(-30, 205)]),
    Ridge(radius: 0.172, drop: 0.018, spans: [(-52, 222)]),
    Ridge(radius: 0.252, drop: 0.036, spans: [(-64, 58), (88, 232)]),
    Ridge(radius: 0.332, drop: 0.054, spans: [(-76, 240)]),
]

// prints are never symmetric: the whole loop leans, and each larger ridge's
// centre also drifts a little to the left of the core
let tiltDegrees: CGFloat = -13
let driftPerRidge: CGFloat = 0.007

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

    // faint inner glow behind the whorl so the ridges sit on something
    let centre = CGPoint(x: size * 0.5, y: size * 0.56)
    let glow = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [rgb(0xF6C177, 0.16), rgb(0xF6C177, 0)] as CFArray,
        locations: [0, 1]
    )!
    context.drawRadialGradient(
        glow,
        startCenter: centre, startRadius: 0,
        endCenter: centre, endRadius: size * 0.46,
        options: []
    )

    let weight = size * 0.056
    context.setLineCap(.round)
    context.setLineWidth(weight)
    context.saveGState()
    context.translateBy(x: centre.x, y: centre.y)
    context.rotate(by: tiltDegrees * .pi / 180)
    context.translateBy(x: -centre.x, y: -centre.y)
    for (index, ridge) in ridges.enumerated() {
        context.setStrokeColor(index == ridges.count - 1 ? ridgeDeepColor : ridgeColor)
        let ridgeCentre = CGPoint(
            x: centre.x - size * driftPerRidge * CGFloat(index),
            y: centre.y - size * ridge.drop
        )
        for span in ridge.spans {
            context.addArc(
                center: ridgeCentre,
                radius: size * ridge.radius,
                startAngle: span.0 * .pi / 180,
                endAngle: span.1 * .pi / 180,
                clockwise: false
            )
            context.strokePath()
        }
    }
    context.restoreGState()

    // the commit node: a filled core with a dark ring so it reads as a node,
    // not as the fifth ridge
    let coreRadius = size * 0.046
    context.setFillColor(bodyBottom)
    context.fillEllipse(in: CGRect(
        x: centre.x - coreRadius - weight * 0.55,
        y: centre.y - coreRadius - weight * 0.55,
        width: (coreRadius + weight * 0.55) * 2,
        height: (coreRadius + weight * 0.55) * 2
    ))
    context.setFillColor(coreColor)
    context.fillEllipse(in: CGRect(
        x: centre.x - coreRadius,
        y: centre.y - coreRadius,
        width: coreRadius * 2,
        height: coreRadius * 2
    ))
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

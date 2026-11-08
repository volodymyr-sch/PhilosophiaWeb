// Makes the motion mask for the live home painting: website/assets/images/blue-hour-mask.png
// Red = clouds that drift, green = flowers that sway, blue = hair and robe end in the wind.
// home.js reads it. Make it again when the painting changes.
// Run from the repo root: swift tools/make_live_mask.swift [--preview out.png]
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

let source = "website/assets/images/blue-hour.webp"
let target = "website/assets/images/blue-hour-mask.png"
let scale = 4 // the mask is 1/4 of the painting size; it is blurred, so this is enough

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

guard let imageSource = CGImageSourceCreateWithURL(URL(fileURLWithPath: source) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else { fail("Cannot read \(source)") }
let width = image.width, height = image.height
let w = width / scale, h = height / scale

// Painting pixels, made small (area average by the context).
func smallPixels(_ image: CGImage) -> [UInt8] {
    var data = [UInt8](repeating: 0, count: w * h * 4)
    let context = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    return data
}
let rgba = smallPixels(image)

// The philosopher and his rock, from Apple Vision (the same "lift subject" as in Photos).
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: image)
do { try handler.perform([request]) } catch { fail("Vision failed: \(error)") }
guard let result = request.results?.first,
      let buffer = try? result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler) else {
    fail("Vision found no subject")
}
CVPixelBufferLockBaseAddress(buffer, .readOnly)
let maskRow = CVPixelBufferGetBytesPerRow(buffer) / MemoryLayout<Float>.size
let maskBase = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: Float.self)
var subject = [Float](repeating: 0, count: w * h)
for y in 0..<h {
    for x in 0..<w {
        var sum: Float = 0
        for dy in 0..<scale { for dx in 0..<scale { sum += maskBase[(y * scale + dy) * maskRow + x * scale + dx] } }
        subject[y * w + x] = sum / Float(scale * scale)
    }
}
CVPixelBufferUnlockBaseAddress(buffer, .readOnly)

func smoothstep(_ a: Float, _ b: Float, _ x: Float) -> Float {
    let t = min(max((x - a) / (b - a), 0), 1)
    return t * t * (3 - 2 * t)
}

// Max filter: grows a mask by r pixels.
func grow(_ m: [Float], _ r: Int) -> [Float] {
    var out = m
    for y in 0..<h {
        for x in 0..<w {
            var best: Float = 0
            for dy in -r...r {
                for dx in -r...r where dx * dx + dy * dy <= r * r {
                    let xx = x + dx, yy = y + dy
                    if xx >= 0, yy >= 0, xx < w, yy < h { best = max(best, m[yy * w + xx]) }
                }
            }
            out[y * w + x] = best
        }
    }
    return out
}

// Three box blurs are close to a Gaussian blur.
func blur(_ m: [Float], _ r: Int) -> [Float] {
    var a = m, b = m
    for _ in 0..<3 {
        for y in 0..<h {
            for x in 0..<w {
                var sum: Float = 0, n: Float = 0
                for dx in -r...r where x + dx >= 0 && x + dx < w { sum += a[y * w + x + dx]; n += 1 }
                b[y * w + x] = sum / n
            }
        }
        for y in 0..<h {
            for x in 0..<w {
                var sum: Float = 0, n: Float = 0
                for dy in -r...r where y + dy >= 0 && y + dy < h { sum += b[(y + dy) * w + x]; n += 1 }
                a[y * w + x] = sum / n
            }
        }
    }
    return a
}

// The top edge of the hill (measured on the painting): (u, v) points from left to right.
let hillEdge: [(Float, Float)] = [(0, 0.672), (0.1, 0.70), (0.2, 0.735), (0.3, 0.762), (0.4, 0.80), (0.5, 0.825), (0.6, 0.83), (1, 0.835)]
func hillTop(_ u: Float) -> Float {
    for k in 1..<hillEdge.count where u <= hillEdge[k].0 {
        let (u0, v0) = hillEdge[k - 1], (u1, v1) = hillEdge[k]
        return v0 + (v1 - v0) * (u - u0) / (u1 - u0)
    }
    return hillEdge.last!.1
}

func box(_ u: Float, _ v: Float, _ u0: Float, _ u1: Float, _ v0: Float, _ v1: Float, _ soft: Float) -> Float {
    smoothstep(u0 - soft, u0, u) * (1 - smoothstep(u1, u1 + soft, u)) * smoothstep(v0 - soft, v0, v) * (1 - smoothstep(v1, v1 + soft, v))
}

let near = grow(subject.map { $0 > 0.5 ? 1 : 0 }, 5) // 20 px around him: nothing else moves there
var clouds = [Float](repeating: 0, count: w * h)
var flowers = [Float](repeating: 0, count: w * h)
var wind = [Float](repeating: 0, count: w * h)
for y in 0..<h {
    for x in 0..<w {
        let i = y * w + x
        let u = (Float(x) + 0.5) / Float(w), v = (Float(y) + 0.5) / Float(h)
        let r = Float(rgba[i * 4]) / 255, g = Float(rgba[i * 4 + 1]) / 255, b = Float(rgba[i * 4 + 2]) / 255
        let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        let free = 1 - near[i]
        let hill = hillTop(u)
        // Clouds: between the horizon and the hill. The far mountains (dark, near the horizon) stay still.
        let notMountain = max(smoothstep(0.40, 0.50, luma), smoothstep(0.645, 0.67, v))
        clouds[i] = smoothstep(0.56, 0.60, v) * (1 - smoothstep(hill - 0.03, hill - 0.005, v)) * notMountain * free
        // Flowers: the hill, more at the bottom where they are big and near. The rock on the right stays still.
        let rock = box(u, v, 0.735, 0.92, 0.815, 0.87, 0.015)
        flowers[i] = smoothstep(hill - 0.005, hill + 0.02, v) * free * (1 - rock) * (0.35 + 0.65 * smoothstep(0.80, 1.0, v))
        // Wind on him: his hair and the loose end of the robe on the left.
        let hair = box(u, v, 0.47, 0.53, 0.505, 0.55, 0.025)
        let robeEnd = box(u, v, 0.345, 0.395, 0.63, 0.76, 0.025)
        wind[i] = max(hair * 0.6, robeEnd) * near[i]
    }
}
clouds = blur(clouds, 3)
flowers = blur(flowers, 3)
wind = blur(wind, 2)

func write(_ path: String, _ pixel: (Int) -> (Float, Float, Float)) {
    var data = [UInt8](repeating: 255, count: w * h * 4)
    for i in 0..<(w * h) {
        let (r, g, b) = pixel(i)
        data[i * 4] = UInt8(max(0, min(1, r)) * 255 + 0.5)
        data[i * 4 + 1] = UInt8(max(0, min(1, g)) * 255 + 0.5)
        data[i * 4 + 2] = UInt8(max(0, min(1, b)) * 255 + 0.5)
    }
    let context = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    let out = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(out, context.makeImage()!, nil)
    if !CGImageDestinationFinalize(out) { fail("Cannot write \(path)") }
}

write(target) { (clouds[$0], flowers[$0], wind[$0]) }
print("Wrote \(target) (\(w)x\(h))")

// --preview out.png: the mask over a dim copy of the painting, to check it by eye.
if let at = CommandLine.arguments.firstIndex(of: "--preview"), at + 1 < CommandLine.arguments.count {
    write(CommandLine.arguments[at + 1]) { i in
        let dim: Float = 0.35
        let r = Float(rgba[i * 4]) / 255 * dim, g = Float(rgba[i * 4 + 1]) / 255 * dim, b = Float(rgba[i * 4 + 2]) / 255 * dim
        return (r + clouds[i] * 0.8, g + flowers[i] * 0.8, b + wind[i])
    }
    print("Wrote preview \(CommandLine.arguments[at + 1])")
}

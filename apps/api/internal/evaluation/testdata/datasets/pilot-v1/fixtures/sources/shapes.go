// 글자 없는 합성 사진을 그린다. 사용: go run shapes.go <out.png>
package main

import (
	"image"
	"image/color"
	"image/png"
	"os"
)

func main() {
	const w, h = 720, 960
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	circles := []struct {
		x, y, r int
		c       color.NRGBA
	}{
		{220, 300, 140, color.NRGBA{240, 170, 90, 255}},
		{500, 520, 180, color.NRGBA{120, 180, 150, 255}},
		{300, 760, 110, color.NRGBA{200, 120, 140, 255}},
	}
	for y := range h {
		for x := range w {
			// 위는 하늘색, 아래로 갈수록 옅어진다.
			shade := uint8(170 + 70*y/h)
			px := color.NRGBA{shade, uint8(210 + 30*y/h), 250, 255}
			for _, c := range circles {
				if (x-c.x)*(x-c.x)+(y-c.y)*(y-c.y) <= c.r*c.r {
					px = c.c
				}
			}
			img.SetNRGBA(x, y, px)
		}
	}
	f, err := os.Create(os.Args[1])
	if err != nil {
		panic(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		panic(err)
	}
}

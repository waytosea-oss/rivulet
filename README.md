# Rivulet

细流引水。二维粒子水，用屏幕空间流体画成有厚度的水面。关卡围绕普通画线游戏做不到的水：浮力、连通器、倾斜、油水分层、积水压开活板。

浏览器打开 `index.html`。第 5 关用底部的 Lean，或方向键，或手机倾斜。画质按钮在 Auto、Low、High 之间切换；帧时间偏高时 Auto 会降到仍带光照的简化水面。

```
node tools/verify.mjs
node build-portal.mjs
node build-portal.mjs --sdk poki
node build-portal.mjs --sdk crazygames
```

外观出处和没做进关卡的玩法写在 `docs/water-reference.md`。

// MARGIN 设计语言共享样式（发丝线 / 物理阴影 / Liquid Glass / CSS 极光）
// 由需要该设计语言的页面各自通过 <style> 注入（如 /movies-v2 与 MovieDuel）

export const MARGIN_CSS = `
body{background:#111112}
:root{
  --sh-sm:0 7px 14px rgba(0,0,0,.12),0 27px 25px rgba(0,0,0,.10),0 60px 34px rgba(0,0,0,.06),0 106px 41px rgba(0,0,0,.02);
  --sh-lg:0 7px 14px rgba(0,0,0,.31),0 27px 25px rgba(0,0,0,.27),0 60px 34px rgba(0,0,0,.16),0 106px 41px rgba(0,0,0,.05),0 166px 45px rgba(0,0,0,.01);
}
.hair{border:1px solid rgba(255,255,255,.08)}
.hair-strong{border:1px solid rgba(255,255,255,.16)}
@media (resolution>=2x){.hair,.hair-strong{border-width:.5px}}
/* Liquid Glass：高透明 + blur/saturate + 内侧顶部高光（影片卡片以外的面板用） */
.glass{
  background:rgba(28,28,31,.42);
  backdrop-filter:blur(30px) saturate(170%);
  -webkit-backdrop-filter:blur(30px) saturate(170%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 1px 2px rgba(0,0,0,.18),var(--sh-sm);
}
.aurora{position:absolute;inset:0;background:#111112}
.aurora .blob{position:absolute;border-radius:50%;filter:blur(90px);mix-blend-mode:screen;will-change:transform}
.aurora .b1{width:56vw;height:56vw;left:-14vw;top:-20vh;background:radial-gradient(circle at 50% 50%,rgba(0,174,236,.52) 0%,rgba(0,174,236,0) 66%);animation:margin-drift-a 48s ease-in-out infinite alternate}
.aurora .b2{width:50vw;height:50vw;right:-16vw;top:-8vh;background:radial-gradient(circle at 50% 50%,rgba(46,224,196,.38) 0%,rgba(46,224,196,0) 66%);animation:margin-drift-b 62s ease-in-out infinite alternate}
.aurora .b3{width:64vw;height:64vw;left:16vw;bottom:-34vh;background:radial-gradient(circle at 50% 50%,rgba(99,91,255,.36) 0%,rgba(99,91,255,0) 66%);animation:margin-drift-c 76s ease-in-out infinite alternate}
.aurora .b4{width:36vw;height:36vw;right:6vw;bottom:-6vh;background:radial-gradient(circle at 50% 50%,rgba(0,120,255,.30) 0%,rgba(0,120,255,0) 66%);animation:margin-drift-b 54s ease-in-out infinite alternate-reverse}
.aurora .veil{position:absolute;inset:0;background:radial-gradient(130% 100% at 50% 0%,rgba(17,17,18,0) 42%,rgba(17,17,18,.78) 100%)}
@keyframes margin-drift-a{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(12vw,9vh,0) scale(1.22)}}
@keyframes margin-drift-b{from{transform:translate3d(0,0,0) scale(1.08)}to{transform:translate3d(-10vw,7vh,0) scale(.94)}}
@keyframes margin-drift-c{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(9vw,-8vh,0) scale(1.18)}}
@media (prefers-reduced-motion:reduce){.aurora .blob{animation:none}}
`;

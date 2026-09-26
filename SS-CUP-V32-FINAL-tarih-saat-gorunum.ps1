$ErrorActionPreference="Stop"
$c="src\components\KnockoutDraw.css"
if(!(Test-Path $c)){throw "KnockoutDraw.css bulunamadi"}
$css=Get-Content $c -Raw -Encoding UTF8
$css += @'

/* V32 FINAL: eleme tarih/saat gorunumunu siyah-sari temaya yedir */
.ko-inline-schedule{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
  margin:10px 0 8px;
  padding:10px 12px;
  border-top:1px solid rgba(244,196,0,.28);
  border-bottom:1px solid rgba(244,196,0,.12);
  border-radius:10px;
  background:linear-gradient(180deg,rgba(244,196,0,.055),rgba(0,0,0,.12));
}
.ko-inline-schedule label{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
}
.ko-inline-schedule label span{
  flex:0 0 auto;
  margin:0;
  color:#f4c400;
  font-size:10px;
  font-weight:900;
  letter-spacing:.65px;
}
.ko-inline-schedule input{
  min-width:0;
  width:100%;
  height:32px;
  box-sizing:border-box;
  padding:0 7px;
  border:0;
  border-bottom:1px solid rgba(244,196,0,.42);
  border-radius:0;
  outline:none;
  background:transparent;
  color:#f5f5f5;
  color-scheme:dark;
  font-size:12px;
  font-weight:800;
  text-align:center;
  box-shadow:none;
}
.ko-inline-schedule input:hover,
.ko-inline-schedule input:focus{
  border-bottom-color:#f4c400;
  background:rgba(244,196,0,.04);
}
.ko-inline-schedule input::-webkit-calendar-picker-indicator{
  opacity:.72;
  cursor:pointer;
  filter:sepia(1) saturate(4);
}
@media(max-width:520px){
  .ko-inline-schedule{gap:7px;padding:8px 9px}
  .ko-inline-schedule label{gap:5px}
  .ko-inline-schedule label span{font-size:9px;letter-spacing:.35px}
  .ko-inline-schedule input{height:30px;padding:0 4px;font-size:11px}
}
'@
Set-Content $c $css -Encoding UTF8
Write-Host "V32 FINAL gorunum uygulandi. Sadece CSS degisti." -ForegroundColor Green
Write-Host "Simdi npm run build" -ForegroundColor Cyan

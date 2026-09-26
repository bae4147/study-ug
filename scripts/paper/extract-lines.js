// Step 1 of 2 in turning the PDF into the text the generators read.
// Rebuilds the paper as lines from glyph positions, keeping the page layout that
// flat text extraction throws away: which lines are running heads, where a
// paragraph is indented, where a table row's cells sit (gaps become tabs).
//
//   PDFJS=/path/to/pdf.min.js node scripts/paper/extract-lines.js <paper.pdf> <lines.json>
//
// pdf.js 3.11.174 (the build the site loads), with pdf.worker.js beside it.
const fs=require('fs');
globalThis.DOMMatrix=class{}; globalThis.ImageData=class{}; globalThis.Path2D=class{};
const pdfjs=require(process.env.PDFJS || './pdf.min.js');
(async()=>{
  const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2]))}).promise;
  const out=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const H=page.getViewport({scale:1}).height;
    const tc=await page.getTextContent();
    const rows=new Map();
    for(const it of tc.items){
      if(!it.str.trim()) continue;
      const y=Math.round(it.transform[5]);
      const key=[...rows.keys()].find(k=>Math.abs(k-y)<=2) ?? y;
      if(!rows.has(key)) rows.set(key,[]);
      rows.get(key).push({x:it.transform[4], w:it.width, s:it.str});
    }
    const ys=[...rows.keys()].sort((a,b)=>b-a);
    for(const y of ys){
      const cells=rows.get(y).sort((a,b)=>a.x-b.x);
      let line='', end=null;
      for(const c of cells){
        if(end!==null){ const gap=c.x-end; line += gap>14 ? ' \t ' : (gap>1.2 ? ' ' : ''); }
        line+=c.s; end=c.x+c.w;
      }
      out.push({page:p, y, top:H-y, x0:Math.round(cells[0].x), text:line.replace(/\s+$/,'')});
    }
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(out));
  console.log('lines:', out.length);
})().catch(e=>console.error(e.message));

/* TLOG Analyzer v1.3.1 — lazy 3D map module
   Loaded ONLY after the user presses the 3D button.
   UI-only: does not change TLOG analysis, Timeline, NED/DR, AI conclusions or checksum. */
(function(){
  "use strict";
  var CTX=null;
  function pointAltitudeMeters(point){
    try{
      var STATE=CTX.STATE;
      var isNum = CTX && typeof CTX.isNum === "function" ? CTX.isNum : function(v){ return typeof v === "number" && Number.isFinite(v); };
      var row=STATE.data && Array.isArray(STATE.data.timeline) && point && isNum(point.timelineIndex)
        ? STATE.data.timeline[point.timelineIndex]
        : null;
      if(!row) return 0;
      var candidates=[row.alt, row.altitude, row.relativeAlt, row.relAlt];
      for(var i=0;i<candidates.length;i++){
        var v=candidates[i];
        if(isNum(v)) return Math.max(0,Number(v));
        if(typeof v==='string'){
          var n=parseFloat(v.replace(',','.'));
          if(Number.isFinite(n)) return Math.max(0,n);
        }
      }
    }catch(_e){}
    return 0;
  }

  function resetView(STATE,kind){
    kind=kind||"ISO";
    if(kind==="TOP") STATE.view3d={yaw:0,pitch:89.5,zoom:1,panX:0,panY:0};
    else if(kind==="NORTH") STATE.view3d={yaw:90,pitch:0,zoom:1,panX:0,panY:0};
    else if(kind==="EAST") STATE.view3d={yaw:0,pitch:0,zoom:1,panX:0,panY:0};
    else STATE.view3d={yaw:-42,pitch:28,zoom:1,panX:0,panY:0};
  }

  function draw3D(ctx){
    CTX=ctx;
    var STATE=ctx.STATE, svgEl=ctx.svgEl, isNum=ctx.isNum, modeColor=ctx.modeColor, renderTelemetryDetails=ctx.renderTelemetryDetails;
    var svg=document.getElementById("mapDrSvg");
    var info=document.getElementById("mapDrInfo");
    var sourceBox=document.getElementById("mapDrSource");
    var zoomResetBtn=document.getElementById("mapZoomReset");
    if(!svg) return;
    svg.innerHTML="";
    var flight=STATE.flights[STATE.active];
    if(!flight || !Array.isArray(flight.points) || flight.points.length<2){
      if(info) info.textContent="3D • недостатньо точок маршруту";
      var tx=svgEl("text",{x:500,y:300,"text-anchor":"middle",fill:"#94a3b8","font-size":16});
      tx.textContent="Для 3D потрібна траєкторія щонайменше з 2 точок"; svg.appendChild(tx); return;
    }

    var pts=flight.points.map(function(p){return {p:p,n:Number(p.north)||0,e:Number(p.east)||0,a:pointAltitudeMeters(p)};});
    var minN=Infinity,maxN=-Infinity,minE=Infinity,maxE=-Infinity,maxA=0;
    pts.forEach(function(q){minN=Math.min(minN,q.n);maxN=Math.max(maxN,q.n);minE=Math.min(minE,q.e);maxE=Math.max(maxE,q.e);maxA=Math.max(maxA,q.a);});
    if(!isFinite(minN)){minN=-20;maxN=20;minE=-20;maxE=20;}
    var spanN=Math.max(40,maxN-minN), spanE=Math.max(40,maxE-minE), spanA=Math.max(50,maxA+50);
    var padH=Math.max(20,Math.max(spanN,spanE)*0.08);
    minN-=padH;maxN+=padH;minE-=padH;maxE+=padH;
    spanN=maxN-minN; spanE=maxE-minE;

    // 3D — візуальне підсилення висоти.
    // На далекому польоті горизонталь може бути 5–15 км, а висота 100–300 м,
    // тому при строгому 1:1 профіль майже плоский. Масштаб ALT збільшуємо
    // ЛИШЕ для відображення; фактичні значення висоти та всі розрахунки
    // залишаються незмінними.
    var horizontalSpan=Math.max(spanN,spanE);
    var verticalExaggeration=Math.max(1,Math.min(30,(horizontalSpan/Math.max(1,spanA))*0.75));

    var centerN=(minN+maxN)/2, centerE=(minE+maxE)/2, centerA=spanA*0.42;
    var worldSpan=Math.max(spanN,spanE,spanA*verticalExaggeration*1.25);

    var v=STATE.view3d||{yaw:-42,pitch:28,zoom:1,panX:0,panY:0};
    v.zoom=Math.max(0.25,Math.min(12,Number(v.zoom)||1)); STATE.view3d=v;
    if(zoomResetBtn) zoomResetBtn.textContent=Math.round(v.zoom*100)+"%";
    var yaw=(Number(v.yaw)||0)*Math.PI/180, pitch=(Number(v.pitch)||0)*Math.PI/180;
    var cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);

    // AUTO-FIT 3D:
    // замість масштабу від найбільшого worldSpan рахуємо реальний
    // 2D bounding-box ПІСЛЯ повороту камери. Тому траєкторія займає
    // приблизно 88% ширини і 82% висоти карти незалежно від напрямку польоту.
    function rotateOnly(n,e,a){
      var x=e-centerE, y=(a-centerA)*verticalExaggeration, z=n-centerN;
      var x1=x*cy-z*sy, z1=x*sy+z*cy;
      var y2=y*cp-z1*sp;
      var z2=y*sp+z1*cp;
      return {x:x1,y:y2,depth:z2};
    }

    var fitPts=[
      [minN,minE,0],[minN,maxE,0],[maxN,minE,0],[maxN,maxE,0],
      [minN,minE,spanA],[minN,maxE,spanA],[maxN,minE,spanA],[maxN,maxE,spanA]
    ];
    // Додаємо сам маршрут, щоб довгі діагональні польоти теж заповнювали екран.
    pts.forEach(function(q){fitPts.push([q.n,q.e,q.a]);});

    var rxMin=Infinity,rxMax=-Infinity,ryMin=Infinity,ryMax=-Infinity;
    fitPts.forEach(function(q){
      var r=rotateOnly(q[0],q[1],q[2]);
      rxMin=Math.min(rxMin,r.x); rxMax=Math.max(rxMax,r.x);
      ryMin=Math.min(ryMin,r.y); ryMax=Math.max(ryMax,r.y);
    });
    var projW=Math.max(1,rxMax-rxMin), projH=Math.max(1,ryMax-ryMin);
    var fitScale=Math.min(880/projW, 492/projH);
    var scale=fitScale*v.zoom;

    function project3(n,e,a){
      var r=rotateOnly(n,e,a);
      return {
        x:500+r.x*scale+(Number(v.panX)||0),
        y:305-r.y*scale+(Number(v.panY)||0),
        depth:r.depth
      };
    }

    function line3(a,b,attrs,parent){
      var p1=project3(a[0],a[1],a[2]),p2=project3(b[0],b[1],b[2]);
      var at={x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y}; Object.keys(attrs||{}).forEach(function(k){at[k]=attrs[k];});
      (parent||svg).appendChild(svgEl("line",at));
    }
    function polygon3(list,attrs,parent){
      var text=list.map(function(q){var p=project3(q[0],q[1],q[2]);return p.x+","+p.y;}).join(" ");
      var at={points:text};Object.keys(attrs||{}).forEach(function(k){at[k]=attrs[k];});(parent||svg).appendChild(svgEl("polygon",at));
    }

    // Three coordinate planes. Ground is strongest; vertical planes are subtle.
    polygon3([[minN,minE,0],[maxN,minE,0],[maxN,maxE,0],[minN,maxE,0]],{fill:"rgba(30,41,59,.18)",stroke:"#334155","stroke-width":1});
    polygon3([[minN,minE,0],[maxN,minE,0],[maxN,minE,spanA],[minN,minE,spanA]],{fill:"rgba(14,116,144,.055)",stroke:"#27465a","stroke-width":1});
    polygon3([[minN,minE,0],[minN,maxE,0],[minN,maxE,spanA],[minN,minE,spanA]],{fill:"rgba(99,102,241,.045)",stroke:"#30385f","stroke-width":1});

    function niceStep(m){var t=Math.max(5,m/7),p=Math.pow(10,Math.floor(Math.log(t)/Math.LN10)),q=t/p;return (q<=1?1:q<=2?2:q<=5?5:10)*p;}
    var stepNE=niceStep(Math.max(spanN,spanE)), stepA=niceStep(spanA);
    var grid=svgEl("g",{opacity:.52});
    for(var n=Math.ceil(minN/stepNE)*stepNE;n<=maxN+1e-6;n+=stepNE) line3([n,minE,0],[n,maxE,0],{stroke:"#294154","stroke-width":1},grid);
    for(var e=Math.ceil(minE/stepNE)*stepNE;e<=maxE+1e-6;e+=stepNE) line3([minN,e,0],[maxN,e,0],{stroke:"#294154","stroke-width":1},grid);
    for(var aa=0;aa<=spanA+1e-6;aa+=stepA){
      line3([minN,minE,aa],[maxN,minE,aa],{stroke:"#244458","stroke-width":1},grid);
      line3([minN,minE,aa],[minN,maxE,aa],{stroke:"#30385f","stroke-width":1},grid);
    }
    for(var nn=Math.ceil(minN/stepNE)*stepNE;nn<=maxN+1e-6;nn+=stepNE) line3([nn,minE,0],[nn,minE,spanA],{stroke:"#244458","stroke-width":1},grid);
    for(var ee=Math.ceil(minE/stepNE)*stepNE;ee<=maxE+1e-6;ee+=stepNE) line3([minN,ee,0],[minN,ee,spanA],{stroke:"#30385f","stroke-width":1},grid);
    svg.appendChild(grid);

    // Antenna sectors projected on ground plane, UI-only.
    // 1) Основний сектор АС (backend / manual)
    // 2) Незалежний dBm-напрямок (той самий алгоритм, що у 2D)
    var ant=STATE.data&&STATE.data.ai&&STATE.data.ai.antennaAnalysis?STATE.data.ai.antennaAnalysis:null;
    var antCenter=ant&&ant.available&&isNum(ant.center)?Number(ant.center):null;
    if(STATE.antennaMode==="MANUAL"&&isNum(STATE.manualAntennaAz)) antCenter=Number(STATE.manualAntennaAz);

    var dbmAntenna=null;
    if(ctx && typeof ctx.estimateDbmDirection==="function"){
      try{ dbmAntenna=ctx.estimateDbmDirection(flight,STATE.data); }catch(_dbmErr){ dbmAntenna=null; }
    }

    var backendAntCenter=antCenter;
    var dbmPrimaryInAltHold=false;
    if(
      ant && String(ant.method||"")==="HEADING_FALLBACK" &&
      flight && Number(flight.nedCount||0)===0 &&
      dbmAntenna && dbmAntenna.available &&
      Number(dbmAntenna.bandCount||0)>=3 &&
      isNum(dbmAntenna.avgDeviation) && Number(dbmAntenna.avgDeviation)<=15 &&
      Number(dbmAntenna.confidence||0)>=55
    ){
      antCenter=Number(dbmAntenna.center);
      dbmPrimaryInAltHold=true;
    }

    var maxR=0;pts.forEach(function(q){maxR=Math.max(maxR,Math.sqrt(q.n*q.n+q.e*q.e));}); maxR=Math.max(25,maxR*1.03);

    if(STATE.show3dMainAntenna!==false && isNum(antCenter)){
      var beam=ant&&isNum(ant.beamWidth)?Number(ant.beamWidth):30, half=beam/2;
      var sec=[[0,0,0]];
      for(var si=0;si<=18;si++){
        var az=(antCenter-half+beam*si/18)*Math.PI/180;
        sec.push([maxR*Math.cos(az),maxR*Math.sin(az),0]);
      }
      polygon3(sec,{fill:"rgba(34,197,94,.10)",stroke:"#22c55e","stroke-width":1.2});
      var ar=antCenter*Math.PI/180;
      line3([0,0,0],[maxR*Math.cos(ar),maxR*Math.sin(ar),0],{stroke:"#4ade80","stroke-width":2,"stroke-dasharray":"8 6"});
    }

    if(
      STATE.show3dDbmAntenna!==false &&
      dbmAntenna && dbmAntenna.available && isNum(dbmAntenna.center)
    ){
      var dbmCenter=Number(dbmAntenna.center);
      var dbmBeam=isNum(dbmAntenna.beamWidth)?Number(dbmAntenna.beamWidth):30;
      var dbmHalf=dbmBeam/2;
      var dbmR=maxR*0.96;

      // Без заливки: дві межі + центральна вісь, щоб не перекривати зелений сектор.
      [dbmCenter-dbmHalf,dbmCenter+dbmHalf].forEach(function(azDeg){
        var rr=azDeg*Math.PI/180;
        line3([0,0,0],[dbmR*Math.cos(rr),dbmR*Math.sin(rr),0],{
          stroke:"#38bdf8","stroke-width":1.4,"stroke-dasharray":"4 7",opacity:.95
        });
      });
      var dbmRad=dbmCenter*Math.PI/180;
      line3([0,0,0],[dbmR*Math.cos(dbmRad),dbmR*Math.sin(dbmRad),0],{
        stroke:"#7dd3fc","stroke-width":2.6,"stroke-dasharray":"10 6",opacity:.98
      });
    }

    // Vertical drop lines for selected/representative points.
    var drops=svgEl("g",{opacity:.28});
    var dropEvery=Math.max(1,Math.ceil(pts.length/28));
    pts.forEach(function(q,i){if(i===0||i===pts.length-1||i%dropEvery===0) line3([q.n,q.e,0],[q.n,q.e,q.a],{stroke:"#64748b","stroke-width":.8,"stroke-dasharray":"3 5"},drops);});
    svg.appendChild(drops);

    // Route segments keep the same mode colors as 2D.
    var route=svgEl("g",{});
    for(var i=1;i<pts.length;i++){
      var q0=pts[i-1],q1=pts[i], p0=project3(q0.n,q0.e,q0.a), p1=project3(q1.n,q1.e,q1.a);
      var col=modeColor(q1.p.mode), at={x1:p0.x,y1:p0.y,x2:p1.x,y2:p1.y,stroke:col,"stroke-width":3.4,"stroke-linecap":"round",opacity:.96};
      if(q1.p.source==="DR") at["stroke-dasharray"]="7 5";
      route.appendChild(svgEl("line",at));
    }
    svg.appendChild(route);

    // Clickable telemetry points. We keep transparent hit-zones; visible markers are sparse.
    var hits=svgEl("g",{}), marks=svgEl("g",{}), every=Math.max(1,Math.ceil(pts.length/160));
    pts.forEach(function(q,i){
      var pp=project3(q.n,q.e,q.a); if(pp.x<-20||pp.x>1020||pp.y<-20||pp.y>620)return;
      var selected=STATE.selectedTimelineIndex===q.p.timelineIndex;
      if(selected||i===0||i===pts.length-1||i%every===0){marks.appendChild(svgEl("circle",{cx:pp.x,cy:pp.y,r:selected?5:1.6,fill:selected?"#f8fafc":"#cbd5e1",stroke:selected?modeColor(q.p.mode):"none","stroke-width":selected?3:0,opacity:selected?1:.55}));}
      var hit=svgEl("circle",{cx:pp.x,cy:pp.y,r:7,fill:"transparent",stroke:"none","data-map-hit":"1",tabindex:0,role:"button","aria-label":"3D телеметрія "+String(q.p.time||"")});hit.style.cursor="pointer";
      function select(){STATE.selectedTimelineIndex=q.p.timelineIndex;var row=STATE.data&&Array.isArray(STATE.data.timeline)?STATE.data.timeline[q.p.timelineIndex]:null;renderTelemetryDetails(row,q.p);ctx.redraw();}
      hit.addEventListener("click",function(ev){ev.stopPropagation();select();});hit.addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();select();}});hits.appendChild(hit);
    });
    svg.appendChild(marks);svg.appendChild(hits);

    // Origin and axes.
    var o=project3(0,0,0);svg.appendChild(svgEl("circle",{cx:o.x,cy:o.y,r:6,fill:"#090e14",stroke:"#4ade80","stroke-width":2.5}));
    var axisLen=Math.max(20,Math.min(worldSpan*.17,Math.max(spanA,Math.max(spanN,spanE))*.12));
    [[axisLen,0,0,"N","#4ade80"],[0,axisLen,0,"E","#38bdf8"],[0,0,axisLen,"ALT","#f59e0b"]].forEach(function(ax){var ep=project3(ax[0],ax[1],ax[2]);line3([0,0,0],[ax[0],ax[1],ax[2]],{stroke:ax[4],"stroke-width":2.4});var t=svgEl("text",{x:ep.x+5,y:ep.y-5,fill:ax[4],"font-size":12,"font-weight":900});t.textContent=ax[3];svg.appendChild(t);});

    if(info) info.textContent="Політ "+flight.number+" • 3D v1.4.0 • точок "+pts.length+" • MAX ALT "+maxA.toFixed(1)+" м • шкала ALT 0–"+spanA.toFixed(1)+" м • ALT ×"+verticalExaggeration.toFixed(1)+" • zoom "+Math.round(v.zoom*100)+"%"+
      (STATE.show3dMainAntenna!==false&&isNum(antCenter)?" • АС "+antCenter.toFixed(1)+"°":"")+
      (STATE.show3dDbmAntenna!==false&&dbmAntenna&&dbmAntenna.available&&isNum(dbmAntenna.center)?" • dBm "+Number(dbmAntenna.center).toFixed(1)+"°":"")+
      (isNum(backendAntCenter)&&dbmAntenna&&dbmAntenna.available&&isNum(dbmAntenna.center)
        ?" • ΔHeading↔dBm "+Math.abs(((Number(dbmAntenna.center)-Number(backendAntCenter)+180)%360+360)%360-180).toFixed(1)+"°"
        :"");
    if(sourceBox){sourceBox.innerHTML="3D • 3 площини: N/E, N/ALT, E/ALT"+
      "<br>Горизонталь: 1 м = 1 м"+
      "<br>ALT візуально ×"+verticalExaggeration.toFixed(1)+
      "<br>NED (факт): "+flight.nedCount+" • DR: "+flight.drCount+
      (isNum(antCenter)?"<br><span style='color:#4ade80'>Основний АС: "+antCenter.toFixed(1)+"°"+(dbmPrimaryInAltHold?" (dBm primary)":"")+"</span>":"")+
      (dbmPrimaryInAltHold&&isNum(backendAntCenter)
        ?"<br><span style='color:#94a3b8'>Heading fallback: "+Number(backendAntCenter).toFixed(1)+"°</span>"
        :"")+
      (dbmAntenna&&dbmAntenna.available&&isNum(dbmAntenna.center)
        ?"<br><span style='color:#7dd3fc'>АС по dBm: "+Number(dbmAntenna.center).toFixed(1)+"° • "+Number(dbmAntenna.confidence||0).toFixed(0)+"%</span>"
        :"")+
      "<br><span style='color:#94a3b8'>Висота підсилена лише візуально; розрахунки не змінюються</span>";}
    STATE.view={mode:"3D",scale:scale,verticalExaggeration:verticalExaggeration};
  }


  window.TLOG3D={
    version:"1.4.1-althold-dbm-primary",
    resetView:resetView,
    draw:draw3D
  };
})();

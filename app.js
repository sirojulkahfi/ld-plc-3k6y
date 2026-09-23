/**
 * GX Works 2 Ladder Diagram Viewer - Precision SVG Circuit Engine
 * Mitsubishi Q-Series MELSEC-Q Ladder Logic Visualizer
 */

(function () {
  'use strict';

  // Constants
  const OUTPUT_CMDS = new Set([
    'OUT', 'SET', 'RST', 'PLS', 'MOV', 'MOVP', 'DMOV', 'DMOVP',
    'BMOV', 'FMOV', 'FMOVP', 'INC', 'INCP', 'DTOP', 'TOP',
    'MC', 'MCR', 'END', 'E*', 'E/', 'DFLT', 'DINT'
  ]);

  const LD_CMDS = new Set([
    'LD', 'LDI', 'LDP', 'LDF', 'LD=', 'LD>', 'LD<', 'LD>=', 'LD<=', 'LD<>',
    'LDD=', 'LDD<>', 'LDD>=', 'LDD<='
  ]);

  const OR_CMDS = new Set([
    'OR', 'ORI', 'ORP', 'ORF', 'OR=', 'ORD='
  ]);

  // App State
  const state = {
    currentProg: 'MAIN',
    viewMode: 'ladder', // 'ladder' | 'mnemonic' | 'io'
    filterType: 'ALL',
    searchQuery: '',
    data: window.PLC_PRELOADED_DATA || {},
    rungs: [],
    selectedDevice: null
  };

  // DOM Elements
  const DOM = {
    programTabs: document.getElementById('programTabs'),
    tabMain: document.getElementById('tabMain'),
    tabAlarm: document.getElementById('tabAlarm'),
    tabCamera: document.getElementById('tabCamera'),
    tabIO: document.getElementById('tabIO'),
    currentProgMeta: document.getElementById('currentProgMeta'),
    rungsCountMeta: document.getElementById('rungsCountMeta'),
    rungsStream: document.getElementById('rungsStream'),
    mnemonicTableBody: document.getElementById('mnemonicTableBody'),
    rackVisual: document.getElementById('rackVisual'),
    ladderView: document.getElementById('ladderView'),
    mnemonicView: document.getElementById('mnemonicView'),
    ioView: document.getElementById('ioView'),
    btnModeLadder: document.getElementById('btnModeLadder'),
    btnModeMnemonic: document.getElementById('btnModeMnemonic'),
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    stepJumpInput: document.getElementById('stepJumpInput'),
    stepJumpBtn: document.getElementById('stepJumpBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    printBtn: document.getElementById('printBtn'),
    csvFileInput: document.getElementById('csvFileInput'),
    xrefDrawer: document.getElementById('xrefDrawer'),
    closeXrefBtn: document.getElementById('closeXrefBtn'),
    xrefDeviceName: document.getElementById('xrefDeviceName'),
    xrefStats: document.getElementById('xrefStats'),
    xrefList: document.getElementById('xrefList'),
    scrollTopBtn: document.getElementById('scrollTopBtn')
  };

  function init() {
    bindEvents();
    loadProgram('MAIN');
    renderIORack();
  }

  // ==========================================================================
  // Rung Segmentation Algorithm
  // ==========================================================================
  function segmentRungs(instructions) {
    if (!instructions || !instructions.length) return [];

    const rungs = [];
    let currRung = [];
    let mpsDepth = 0;
    let ldStack = 0;
    let hadOutput = false;

    for (let i = 0; i < instructions.length; i++) {
      const inst = instructions[i];
      const cmd = inst.cmd;

      if (
        currRung.length > 0 &&
        hadOutput &&
        mpsDepth === 0 &&
        ldStack <= 1 &&
        (LD_CMDS.has(cmd) || cmd === 'END' || cmd === 'MCR')
      ) {
        rungs.push(currRung);
        currRung = [];
        hadOutput = false;
        ldStack = 0;
      }

      currRung.push(inst);

      if (cmd === 'MPS') mpsDepth++;
      else if (cmd === 'MPP') mpsDepth = Math.max(0, mpsDepth - 1);

      if (LD_CMDS.has(cmd)) ldStack++;
      else if (cmd === 'ANB' || cmd === 'ORB') ldStack = Math.max(1, ldStack - 1);

      if (OUTPUT_CMDS.has(cmd)) hadOutput = true;
    }

    if (currRung.length > 0) {
      rungs.push(currRung);
    }

    return rungs;
  }

  // ==========================================================================
  // Decompose Rung into Branch Tiers (Eliminates MPS/MPP contact boxes)
  // ==========================================================================
  function decomposeRung(insts) {
    const hasMps = insts.some(x => x.cmd === 'MPS');

    if (hasMps) {
      const prefix = [];
      const tiers = [];
      let currInputs = [];
      let inMps = false;
      let branchCol = 0;

      for (let i = 0; i < insts.length; i++) {
        const x = insts[i];
        const cmd = x.cmd;

        if (cmd === 'MPS') {
          inMps = true;
          branchCol = prefix.length;
        } else if (cmd === 'MRD' || cmd === 'MPP') {
          // Marker for next parallel branch
        } else if (cmd === 'ANB' || cmd === 'ORB') {
          // Block joiner, not a contact
          continue;
        } else if (OUTPUT_CMDS.has(cmd)) {
          if (tiers.length === 0) {
            tiers.push({
              contacts: prefix.concat(currInputs),
              output: x,
              branchCol: branchCol,
              isBranch: false
            });
          } else {
            tiers.push({
              contacts: Array.from(currInputs),
              output: x,
              branchCol: branchCol,
              isBranch: true
            });
          }
          currInputs = [];
        } else {
          if (!inMps) {
            prefix.push(x);
          } else {
            currInputs.push(x);
          }
        }
      }

      if (currInputs.length > 0) {
        tiers.push({
          contacts: currInputs,
          output: null,
          branchCol: branchCol,
          isBranch: true
        });
      }

      return tiers.length > 0 ? tiers : [{ contacts: prefix, output: null, branchCol: 0, isBranch: false }];
    } else {
      // Standard rung without MPS
      const inputs = [];
      const outputs = [];

      for (let i = 0; i < insts.length; i++) {
        const x = insts[i];
        if (x.cmd === 'ANB' || x.cmd === 'ORB') continue;
        if (OUTPUT_CMDS.has(x.cmd)) {
          outputs.push(x);
        } else {
          inputs.push(x);
        }
      }

      if (outputs.length <= 1) {
        return [{
          contacts: inputs,
          output: outputs[0] || null,
          branchCol: 0,
          isBranch: false
        }];
      } else {
        // Multiple outputs branching in parallel
        return outputs.map((out, idx) => ({
          contacts: idx === 0 ? inputs : [],
          output: out,
          branchCol: inputs.length,
          isBranch: idx > 0
        }));
      }
    }
  }

  // ==========================================================================
  // Program Loader
  // ==========================================================================
  function loadProgram(progName) {
    state.currentProg = progName;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.prog === progName);
    });

    if (progName === 'IO') {
      setViewMode('io');
      DOM.currentProgMeta.innerHTML = `<strong>Tampilan:</strong> I/O Rack & Network IP`;
      DOM.rungsCountMeta.innerHTML = `<strong>Modul:</strong> 4 Modul Terpasang`;
      return;
    }

    // If coming back from IO tab, restore to ladder view mode
    if (state.viewMode === 'io') {
      setViewMode('ladder');
    }

    const progData = state.data[progName];
    if (!progData || !progData.instructions) {
      DOM.rungsStream.innerHTML = `<div class="empty-state">Data program ${progName} tidak ditemukan.</div>`;
      return;
    }

    state.rungs = segmentRungs(progData.instructions);

    DOM.currentProgMeta.innerHTML = `<strong>Program:</strong> ${progName}.csv (${progData.instructions.length} langkah)`;
    DOM.rungsCountMeta.innerHTML = `<strong>Total Rung:</strong> ${state.rungs.length} Rung`;

    renderActiveView();
  }

  function setViewMode(mode) {
    state.viewMode = mode;

    DOM.ladderView.style.display = mode === 'ladder' ? 'block' : 'none';
    DOM.mnemonicView.style.display = mode === 'mnemonic' ? 'block' : 'none';
    DOM.ioView.style.display = mode === 'io' ? 'block' : 'none';

    DOM.btnModeLadder.classList.toggle('active', mode === 'ladder');
    DOM.btnModeMnemonic.classList.toggle('active', mode === 'mnemonic');

    renderActiveView();
  }

  function renderActiveView() {
    if (state.currentProg === 'IO') return;

    if (state.viewMode === 'ladder') {
      renderLadderDiagram();
    } else if (state.viewMode === 'mnemonic') {
      renderMnemonicTable();
    }
  }

  // ==========================================================================
  // Render Ladder Diagram (Pure Continuous SVG Circuit)
  // ==========================================================================
  function renderLadderDiagram() {
    const stream = DOM.rungsStream;
    stream.innerHTML = '';

    const filter = state.filterType;
    const query = state.searchQuery.trim().toUpperCase();

    let matchedRungs = 0;

    state.rungs.forEach((rung, index) => {
      if (!matchesFilter(rung, filter, query)) {
        return;
      }
      matchedRungs++;

      const card = createSVGRungCard(rung, index + 1);
      stream.appendChild(card);
    });

    if (matchedRungs === 0) {
      stream.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <h3>Tidak ada rung yang sesuai dengan pencarian "${escapeHtml(state.searchQuery)}"</h3>
          <p style="margin-top: 0.5rem; font-size: 0.85rem;">Coba periksa nama device atau klik tombol filter 'Semua'.</p>
        </div>
      `;
    }
  }

  function matchesFilter(rung, filter, query) {
    if (filter === 'ALL' && !query) return true;

    const devices = [];
    const cmds = [];

    rung.forEach(inst => {
      cmds.push(inst.cmd);
      inst.operands.forEach(op => devices.push(op.toUpperCase()));
    });

    if (query) {
      const matchQuery = devices.some(d => d.includes(query)) ||
                         cmds.some(c => c.includes(query)) ||
                         rung.some(inst => String(inst.step) === query);
      if (!matchQuery) return false;
    }

    if (filter !== 'ALL') {
      const matchDeviceType = devices.some(d => {
        if (filter === 'X') return d.startsWith('X') || d.startsWith('DX');
        if (filter === 'Y') return d.startsWith('Y') || d.startsWith('DY');
        if (filter === 'M') return d.startsWith('M');
        if (filter === 'D') return d.startsWith('D') || d.startsWith('SD');
        if (filter === 'T') return d.startsWith('T');
        if (filter === 'SM') return d.startsWith('SM') || d.startsWith('SD');
        return false;
      });
      if (!matchDeviceType) return false;
    }

    return true;
  }

  function createSVGRungCard(rung, rungNum) {
    const card = document.createElement('div');
    card.className = 'rung-card';
    card.id = `rung-step-${rung[0].step}`;
    card.dataset.startStep = rung[0].step;

    // Decompose into parallel / branch tiers
    const tiers = decomposeRung(rung);

    // Summary for header
    const outputs = rung.filter(i => OUTPUT_CMDS.has(i.cmd));
    const outSummary = outputs.map(o => `${o.cmd} ${o.operands.join(' ')}`).join(', ') || 'Logic End';

    // Header
    const header = document.createElement('div');
    header.className = 'rung-header';
    header.innerHTML = `
      <div class="rung-meta-left">
        <span class="step-badge" title="Langkah Awal Rung">Step ${rung[0].step}</span>
        <span class="rung-num">Rung #${rungNum}</span>
      </div>
      <div class="rung-summary" title="${escapeHtml(outSummary)}">
        ${escapeHtml(outSummary)}
      </div>
    `;

    // SVG Container
    const svgContainer = document.createElement('div');
    svgContainer.className = 'rung-svg-container';

    // Helper for contact width
    function getContactWidth(inst) {
      return (inst.cmd.includes('=') || inst.cmd.includes('>') || inst.cmd.includes('<')) ? 135 : 85;
    }

    // Dynamic Layout Calculations per rung
    const ROW_HEIGHT = 60;
    const LEFT_RAIL_X = 16;
    const OUTPUT_WIDTH = 160;

    // Measure maximum contact width needed across all tiers
    let maxContactsWidth = 0;
    tiers.forEach(tier => {
      let w = 0;
      if (tier.contacts) {
        tier.contacts.forEach(c => {
          w += getContactWidth(c);
        });
      }
      if (w > maxContactsWidth) maxContactsWidth = w;
    });

    const contactAreaWidth = Math.max(650, maxContactsWidth);
    const outputStartX = LEFT_RAIL_X + contactAreaWidth + 30;
    const RIGHT_RAIL_X = outputStartX + OUTPUT_WIDTH + 30;
    const TOTAL_WIDTH = RIGHT_RAIL_X + 16;
    const numRows = Math.max(1, tiers.length);
    const TOTAL_HEIGHT = numRows * ROW_HEIGHT + 14;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${TOTAL_WIDTH} ${TOTAL_HEIGHT}`);
    svg.setAttribute('class', 'rung-svg');
    svg.style.width = '100%';
    svg.style.minWidth = `${TOTAL_WIDTH}px`;

    // Left Power Rail
    const leftRail = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leftRail.setAttribute('x1', LEFT_RAIL_X);
    leftRail.setAttribute('y1', 0);
    leftRail.setAttribute('x2', LEFT_RAIL_X);
    leftRail.setAttribute('y2', TOTAL_HEIGHT);
    leftRail.setAttribute('class', 'ld-rail');
    svg.appendChild(leftRail);

    // Right Neutral Rail
    const rightRail = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    rightRail.setAttribute('x1', RIGHT_RAIL_X);
    rightRail.setAttribute('y1', 0);
    rightRail.setAttribute('x2', RIGHT_RAIL_X);
    rightRail.setAttribute('y2', TOTAL_HEIGHT);
    rightRail.setAttribute('class', 'ld-rail');
    svg.appendChild(rightRail);

    // Render Tiers
    tiers.forEach((tier, tIdx) => {
      const yCenter = tIdx * ROW_HEIGHT + 36;
      let currX = LEFT_RAIL_X;

      // Handle branch vertical line from parent tier
      if (tier.isBranch) {
        const branchCol = tier.branchCol || 0;
        let branchX = LEFT_RAIL_X;
        if (tiers[0].contacts) {
          for (let i = 0; i < Math.min(branchCol, tiers[0].contacts.length); i++) {
            branchX += getContactWidth(tiers[0].contacts[i]);
          }
        }
        branchX = Math.min(branchX, outputStartX - 40);

        // Vertical drop line from Tier 0 to this tier
        const parentY = 36; // Tier 0 Y
        const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vertLine.setAttribute('x1', branchX);
        vertLine.setAttribute('y1', parentY);
        vertLine.setAttribute('x2', branchX);
        vertLine.setAttribute('y2', yCenter);
        vertLine.setAttribute('class', 'ld-wire');
        svg.appendChild(vertLine);

        currX = branchX;
      }

      // Render Contacts in this tier
      if (tier.contacts && tier.contacts.length > 0) {
        tier.contacts.forEach(contact => {
          const cWidth = getContactWidth(contact);
          const contactG = renderSVGContact(contact, currX, yCenter, cWidth);
          svg.appendChild(contactG);
          currX += cWidth;
        });
      }

      // Wire between last contact and output
      if (outputStartX > currX) {
        const connectWire = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        connectWire.setAttribute('x1', currX);
        connectWire.setAttribute('y1', yCenter);
        connectWire.setAttribute('x2', outputStartX);
        connectWire.setAttribute('y2', yCenter);
        connectWire.setAttribute('class', 'ld-wire');
        svg.appendChild(connectWire);
      }

      // Render Output Coil or Function Block
      if (tier.output) {
        const outputG = renderSVGOutput(tier.output, outputStartX, yCenter, OUTPUT_WIDTH, RIGHT_RAIL_X);
        svg.appendChild(outputG);
      } else {
        // Just wire to rail if no output
        const endWire = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        endWire.setAttribute('x1', outputStartX);
        endWire.setAttribute('y1', yCenter);
        endWire.setAttribute('x2', RIGHT_RAIL_X);
        endWire.setAttribute('y2', yCenter);
        endWire.setAttribute('class', 'ld-wire');
        svg.appendChild(endWire);
      }
    });

    svgContainer.appendChild(svg);
    card.appendChild(header);
    card.appendChild(svgContainer);

    return card;
  }

  // ==========================================================================
  // Render SVG Contact (NO, NC, Pulse, Compare)
  // ==========================================================================
  function renderSVGContact(inst, x, y, width) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'ld-contact-group');

    const cmd = inst.cmd;
    const dev = inst.operands[0] || '';
    const midX = x + width / 2;

    // Comparison Contacts (e.g. LD=, AND=, AND<=, LDD=, etc.)
    if (cmd.includes('=') || cmd.includes('>') || cmd.includes('<')) {
      const op1 = inst.operands[0] || '';
      const op2 = inst.operands[1] || '';
      const labelText = `[ ${cmd} ${op1} ${op2} ]`;

      // Lead in wire
      const w1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      w1.setAttribute('x1', x);
      w1.setAttribute('y1', y);
      w1.setAttribute('x2', x + 6);
      w1.setAttribute('y2', y);
      w1.setAttribute('class', 'ld-wire');
      g.appendChild(w1);

      // Box
      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      box.setAttribute('x', x + 6);
      box.setAttribute('y', y - 13);
      box.setAttribute('width', width - 12);
      box.setAttribute('height', 26);
      box.setAttribute('rx', 3);
      box.setAttribute('class', 'ld-compare-box');
      g.appendChild(box);

      // Text
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', midX);
      text.setAttribute('y', y + 4);
      text.setAttribute('class', 'ld-compare-text');
      text.textContent = labelText;
      text.addEventListener('click', () => openXRef(op1 || op2));
      g.appendChild(text);

      // Lead out wire
      const w2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      w2.setAttribute('x1', x + width - 6);
      w2.setAttribute('y1', y);
      w2.setAttribute('x2', x + width);
      w2.setAttribute('y2', y);
      w2.setAttribute('class', 'ld-wire');
      g.appendChild(w2);

      return g;
    }

    // Standard NO, NC, Pulse Contact
    const barLeftX = midX - 10;
    const barRightX = midX + 10;

    // Lead In Wire (seamless from x to barLeftX)
    const wireIn = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    wireIn.setAttribute('x1', x);
    wireIn.setAttribute('y1', y);
    wireIn.setAttribute('x2', barLeftX);
    wireIn.setAttribute('y2', y);
    wireIn.setAttribute('class', 'ld-wire');
    g.appendChild(wireIn);

    // Left Contact Bar
    const barLeft = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    barLeft.setAttribute('x1', barLeftX);
    barLeft.setAttribute('y1', y - 14);
    barLeft.setAttribute('x2', barLeftX);
    barLeft.setAttribute('y2', y + 14);
    barLeft.setAttribute('class', 'ld-bar');
    g.appendChild(barLeft);

    // Right Contact Bar
    const barRight = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    barRight.setAttribute('x1', barRightX);
    barRight.setAttribute('y1', y - 14);
    barRight.setAttribute('x2', barRightX);
    barRight.setAttribute('y2', y + 14);
    barRight.setAttribute('class', 'ld-bar');
    g.appendChild(barRight);

    // Lead Out Wire (seamless from barRightX to x + width)
    const wireOut = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    wireOut.setAttribute('x1', barRightX);
    wireOut.setAttribute('y1', y);
    wireOut.setAttribute('x2', x + width);
    wireOut.setAttribute('y2', y);
    wireOut.setAttribute('class', 'ld-wire');
    g.appendChild(wireOut);

    // NC Slash
    if (cmd.endsWith('I')) { // LDI, ANI, ORI
      const slash = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      slash.setAttribute('x1', barLeftX - 3);
      slash.setAttribute('y1', y + 14);
      slash.setAttribute('x2', barRightX + 3);
      slash.setAttribute('y2', y - 14);
      slash.setAttribute('class', 'ld-slash');
      g.appendChild(slash);
    }

    // Pulse Rising Arrow (LDP, ANDP, ORP)
    if (cmd.endsWith('P')) {
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrow.setAttribute('d', `M${midX} ${y + 8} L${midX} ${y - 8} M${midX - 5} ${y - 3} L${midX} ${y - 8} L${midX + 5} ${y - 3}`);
      arrow.setAttribute('class', 'ld-arrow');
      g.appendChild(arrow);
    }

    // Pulse Falling Arrow (LDF, ANDF, ORF)
    if (cmd.endsWith('F')) {
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrow.setAttribute('d', `M${midX} ${y - 8} L${midX} ${y + 8} M${midX - 5} ${y + 3} L${midX} ${y + 8} L${midX + 5} ${y + 3}`);
      arrow.setAttribute('class', 'ld-arrow');
      g.appendChild(arrow);
    }

    // Device Label (Above contact)
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', midX);
    label.setAttribute('y', y - 18);
    label.setAttribute('class', 'ld-text-dev');
    label.textContent = dev || cmd;
    label.addEventListener('click', () => openXRef(dev));
    g.appendChild(label);

    return g;
  }

  // ==========================================================================
  // Render SVG Output (Coil or Function Block)
  // ==========================================================================
  function renderSVGOutput(inst, x, y, width, rightRailX) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'ld-output-group');

    const cmd = inst.cmd;
    const ops = inst.operands;
    const dev = ops[0] || '';
    const midX = x + width / 2;

    // Coils: OUT, SET, RST, PLS
    if (cmd === 'OUT' || cmd === 'SET' || cmd === 'RST' || cmd === 'PLS') {
      const isTimer = dev.startsWith('T') || dev.startsWith('C');
      const preset = ops[1] || '';
      let textContent = dev;
      if (cmd === 'SET') textContent = `SET ${dev}`;
      else if (cmd === 'RST') textContent = `RST ${dev}`;
      else if (cmd === 'PLS') textContent = `PLS ${dev}`;
      else if (isTimer && preset) textContent = `${dev} ${preset}`;

      const arcL = midX - 35;
      const arcR = midX + 35;

      // Lead in wire (seamless from x to arcL)
      const wireIn = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      wireIn.setAttribute('x1', x);
      wireIn.setAttribute('y1', y);
      wireIn.setAttribute('x2', arcL);
      wireIn.setAttribute('y2', y);
      wireIn.setAttribute('class', 'ld-wire');
      g.appendChild(wireIn);

      // Left parenthesis arc
      const leftArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      leftArc.setAttribute('d', `M${arcL + 8} ${y - 16} C${arcL - 8} ${y - 8} ${arcL - 8} ${y + 8} ${arcL + 8} ${y + 16}`);
      leftArc.setAttribute('class', 'ld-coil-arc');
      g.appendChild(leftArc);

      // Text inside coil
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', midX);
      text.setAttribute('y', y + 4);
      text.setAttribute('class', 'ld-coil-text');
      text.textContent = textContent;
      text.addEventListener('click', () => openXRef(dev));
      g.appendChild(text);

      // Right parenthesis arc
      const rightArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      rightArc.setAttribute('d', `M${arcR - 8} ${y - 16} C${arcR + 8} ${y - 8} ${arcR + 8} ${y + 8} ${arcR - 8} ${y + 16}`);
      rightArc.setAttribute('class', 'ld-coil-arc');
      g.appendChild(rightArc);

      // Lead out wire (seamless from arcR to right rail)
      const wireOut = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      wireOut.setAttribute('x1', arcR);
      wireOut.setAttribute('y1', y);
      wireOut.setAttribute('x2', rightRailX);
      wireOut.setAttribute('y2', y);
      wireOut.setAttribute('class', 'ld-wire');
      g.appendChild(wireOut);

      return g;
    }

    // Function Block Box (MOV, DMOV, BMOV, FMOV, INC, INCP, DTOP, TOP, MC, MCR, END)
    const boxWidth = width - 16;
    const boxX = x + 8;
    const boxY = y - 18;
    const boxHeight = 36;

    // Lead in wire
    const wIn = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    wIn.setAttribute('x1', x);
    wIn.setAttribute('y1', y);
    wIn.setAttribute('x2', boxX);
    wIn.setAttribute('y2', y);
    wIn.setAttribute('class', 'ld-wire');
    g.appendChild(wIn);

    // Box
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', boxX);
    rect.setAttribute('y', boxY);
    rect.setAttribute('width', boxWidth);
    rect.setAttribute('height', boxHeight);
    rect.setAttribute('rx', 3);
    rect.setAttribute('class', 'ld-fb-box');
    g.appendChild(rect);

    // Header cmd
    const cmdText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    cmdText.setAttribute('x', boxX + boxWidth / 2);
    cmdText.setAttribute('y', boxY + 14);
    cmdText.setAttribute('class', 'ld-fb-header');
    cmdText.textContent = cmd;
    g.appendChild(cmdText);

    // Operands line
    const opsText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    opsText.setAttribute('x', boxX + boxWidth / 2);
    opsText.setAttribute('y', boxY + 28);
    opsText.setAttribute('class', 'ld-fb-text');
    opsText.textContent = ops.join(' ') || '---';
    opsText.addEventListener('click', () => {
      if (ops[0]) openXRef(ops[0]);
    });
    g.appendChild(opsText);

    // Lead out wire to right rail
    const wOut = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    wOut.setAttribute('x1', boxX + boxWidth);
    wOut.setAttribute('y1', y);
    wOut.setAttribute('x2', rightRailX);
    wOut.setAttribute('y2', y);
    wOut.setAttribute('class', 'ld-wire');
    g.appendChild(wOut);

    return g;
  }

  // ==========================================================================
  // Render Mnemonic Table
  // ==========================================================================
  function renderMnemonicTable() {
    const tbody = DOM.mnemonicTableBody;
    tbody.innerHTML = '';

    const progData = state.data[state.currentProg];
    if (!progData || !progData.instructions) return;

    const query = state.searchQuery.trim().toUpperCase();

    progData.instructions.forEach(inst => {
      const devStr = inst.operands.join(' ');
      const matchQuery = !query ||
        String(inst.step).includes(query) ||
        inst.cmd.toUpperCase().includes(query) ||
        devStr.toUpperCase().includes(query);

      if (!matchQuery) return;

      const tr = document.createElement('tr');
      tr.id = `mnemonic-step-${inst.step}`;

      let badgeClass = 'cmd-badge';
      if (LD_CMDS.has(inst.cmd)) badgeClass += ' cmd-ld';
      else if (inst.cmd.startsWith('AND')) badgeClass += ' cmd-and';
      else if (inst.cmd.startsWith('OR')) badgeClass += ' cmd-or';
      else if (inst.cmd === 'OUT' || inst.cmd === 'SET' || inst.cmd === 'RST') badgeClass += ' cmd-out';
      else badgeClass += ' cmd-block';

      tr.innerHTML = `
        <td style="font-weight: 700; color: #0284c7;">${inst.step}</td>
        <td><span class="${badgeClass}">${inst.cmd}</span></td>
        <td>
          ${inst.operands.map(op => `<span class="dev-click" data-device="${op}" style="cursor: pointer; font-weight: 700; margin-right: 6px;">${escapeHtml(op)}</span>`).join('')}
        </td>
        <td style="color: var(--text-muted);">${escapeHtml(inst.lineStmt || '')}</td>
        <td style="color: var(--text-light);">${escapeHtml(inst.note || '')}</td>
      `;

      tr.querySelectorAll('.dev-click').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          openXRef(el.dataset.device);
        });
      });

      tbody.appendChild(tr);
    });
  }

  // ==========================================================================
  // Render Hardware I/O Rack Visual
  // ==========================================================================
  function renderIORack() {
    const container = DOM.rackVisual;
    container.innerHTML = '';

    const ioSlots = state.data['IO_ASSIGNMENT'] || [];

    ioSlots.forEach(slot => {
      const card = document.createElement('div');
      card.className = 'slot-card';
      card.innerHTML = `
        <div class="slot-num">${slot.slot}</div>
        <div class="slot-model">${slot.modelName || 'Empty'}</div>
        <div class="slot-type">${slot.type || 'Standard'}</div>
        <div class="slot-props">
          <div><strong>Points:</strong> ${slot.points || '-'}</div>
          <div><strong>Start XY:</strong> ${slot.startXY !== '' ? slot.startXY : '-'}</div>
          <div><strong>Keterangan:</strong> ${slot.detail || '-'}</div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // ==========================================================================
  // Device Cross-Reference (XRef) System
  // ==========================================================================
  function openXRef(device) {
    if (!device || device.startsWith('K') || device.startsWith('H') || device.startsWith('E')) {
      return;
    }

    state.selectedDevice = device;
    DOM.xrefDeviceName.textContent = device;

    const progData = state.data[state.currentProg];
    if (!progData || !progData.instructions) return;

    const refs = [];
    progData.instructions.forEach(inst => {
      if (inst.operands.some(op => op.toUpperCase() === device.toUpperCase())) {
        const isWrite = OUTPUT_CMDS.has(inst.cmd);
        refs.push({
          step: inst.step,
          cmd: inst.cmd,
          isWrite: isWrite,
          full: `${inst.cmd} ${inst.operands.join(' ')}`
        });
      }
    });

    const readCount = refs.filter(r => !r.isWrite).length;
    const writeCount = refs.filter(r => r.isWrite).length;

    DOM.xrefStats.innerHTML = `
      <span>Dibaca (Input): <strong>${readCount}</strong></span>
      <span>Ditulis (Output): <strong>${writeCount}</strong></span>
    `;

    DOM.xrefList.innerHTML = '';
    refs.forEach(ref => {
      const item = document.createElement('div');
      item.className = 'xref-item';
      item.innerHTML = `
        <div class="xref-item-left">
          <span class="xref-step">Step ${ref.step}</span>
          <span class="xref-type ${ref.isWrite ? 'write' : 'read'}">${ref.isWrite ? 'WRITE' : 'READ'}</span>
        </div>
        <div class="xref-cmd">${escapeHtml(ref.full)}</div>
      `;

      item.addEventListener('click', () => {
        scrollToStep(ref.step);
      });

      DOM.xrefList.appendChild(item);
    });

    DOM.xrefDrawer.classList.add('open');
  }

  function closeXRef() {
    DOM.xrefDrawer.classList.remove('open');
    state.selectedDevice = null;
  }

  // ==========================================================================
  // Scroll & Jump Navigation
  // ==========================================================================
  function scrollToStep(stepNumber) {
    if (state.viewMode === 'mnemonic') {
      const row = document.getElementById(`mnemonic-step-${stepNumber}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('highlighted');
        setTimeout(() => row.classList.remove('highlighted'), 2000);
      }
      return;
    }

    let targetRung = null;
    for (let i = 0; i < state.rungs.length; i++) {
      const rung = state.rungs[i];
      if (rung.some(inst => inst.step >= stepNumber)) {
        targetRung = rung;
        break;
      }
    }

    if (!targetRung && state.rungs.length > 0) {
      targetRung = state.rungs[state.rungs.length - 1];
    }

    if (targetRung) {
      const card = document.getElementById(`rung-step-${targetRung[0].step}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlighted');
        setTimeout(() => card.classList.remove('highlighted'), 2000);
      }
    }
  }

  // ==========================================================================
  // Custom File Uploader
  // ==========================================================================
  function handleFileUpload(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const buffer = e.target.result;
      let text = '';

      const view = new Uint8Array(buffer);
      if (view.length > 2 && view[0] === 0xff && view[1] === 0xfe) {
        const decoder = new TextDecoder('utf-16le');
        text = decoder.decode(buffer);
      } else {
        const decoder = new TextDecoder('utf-8');
        text = decoder.decode(buffer);
      }

      const parsed = parseTSV(text);
      const customKey = file.name.replace(/\.[^/.]+$/, '').toUpperCase();

      state.data[customKey] = parsed;

      const tab = document.createElement('button');
      tab.className = 'tab-btn';
      tab.dataset.prog = customKey;
      tab.innerHTML = `
        <span class="tab-indicator"></span>
        <span class="tab-name">${escapeHtml(file.name)}</span>
        <span class="tab-badge">${parsed.instructions.length} stp</span>
      `;
      tab.addEventListener('click', () => loadProgram(customKey));
      DOM.programTabs.appendChild(tab);

      loadProgram(customKey);
    };

    reader.readAsArrayBuffer(file);
  }

  function parseTSV(text) {
    const lines = text.split(/\r?\n/);
    const instructions = [];
    let curr = null;
    let title = '';
    let plcInfo = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const cols = line.split('\t').map(c => c.replace(/^["']|["']$/g, '').trim());

      if (i === 0 && cols[0]) title = cols[0];
      if (i === 1 && cols[1]) plcInfo = cols[1];

      if (i < 3 || cols.length < 3) continue;

      const step = cols[0];
      const lineStmt = cols[1] || '';
      const cmd = cols[2];
      const dev = cols[3] || '';
      const note = cols[6] || '';

      if (cmd) {
        if (curr) instructions.push(curr);
        curr = {
          step: isNaN(step) ? step : parseInt(step, 10),
          cmd: cmd,
          operands: dev ? [dev] : [],
          lineStmt: lineStmt,
          note: note
        };
      } else if (dev && curr) {
        curr.operands.push(dev);
      }
    }
    if (curr) instructions.push(curr);

    return {
      title: title || 'Custom Program',
      plcInfo: plcInfo || 'QCPU Q04UDEH',
      instructions: instructions
    };
  }

  // ==========================================================================
  // Event Bindings
  // ==========================================================================
  function bindEvents() {
    DOM.programTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (btn && btn.dataset.prog) {
        loadProgram(btn.dataset.prog);
      }
    });

    DOM.btnModeLadder.addEventListener('click', () => {
      if (state.currentProg === 'IO') {
        loadProgram('MAIN');
      }
      setViewMode('ladder');
    });
    DOM.btnModeMnemonic.addEventListener('click', () => {
      if (state.currentProg === 'IO') {
        loadProgram('MAIN');
      }
      setViewMode('mnemonic');
    });

    DOM.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      DOM.clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
      renderActiveView();
    });

    DOM.clearSearchBtn.addEventListener('click', () => {
      DOM.searchInput.value = '';
      state.searchQuery = '';
      DOM.clearSearchBtn.style.display = 'none';
      renderActiveView();
    });

    DOM.stepJumpBtn.addEventListener('click', () => {
      const val = parseInt(DOM.stepJumpInput.value, 10);
      if (!isNaN(val)) scrollToStep(val);
    });

    DOM.stepJumpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = parseInt(DOM.stepJumpInput.value, 10);
        if (!isNaN(val)) scrollToStep(val);
      }
    });

    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filterType = chip.dataset.filter;
        renderActiveView();
      });
    });

    DOM.themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('theme-dark');
      const isDark = document.body.classList.contains('theme-dark');
      localStorage.setItem('plc_viewer_theme', isDark ? 'dark' : 'light');
    });

    if (localStorage.getItem('plc_viewer_theme') === 'dark') {
      document.body.classList.add('theme-dark');
    }

    DOM.printBtn.addEventListener('click', () => window.print());

    DOM.csvFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileUpload(e.target.files[0]);
      }
    });

    DOM.closeXrefBtn.addEventListener('click', closeXRef);

    window.addEventListener('scroll', () => {
      DOM.scrollTopBtn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    });

    DOM.scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

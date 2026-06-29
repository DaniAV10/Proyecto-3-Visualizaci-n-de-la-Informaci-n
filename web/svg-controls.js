(function() {
  const state = {
    zoomEnabled: true,
    panEnabled: true,
    selectEnabled: true,
    selectionColor: 'red',
    callbacks: { zoom: null, pan: null, select: null, multiSelect: null, dblclick: null }
  };

  const run = () => {
    const obj = document.querySelector('object[type="image/xml+svg"], object[type="image/svg+xml"]');
    if (!obj) return;

    let cleanup = null;

    const setup = () => {
      let svgDoc;
      try {
        svgDoc = obj.contentDocument;
      } catch (err) {
        console.error('CORS error: Cannot access contentDocument', err);
        return;
      }
      
      if (!svgDoc) return;
      const svg = svgDoc.documentElement;
      if (!svg || svg.tagName.toLowerCase() !== 'svg') return;

      let panning = false;
      let isDragging = false;
      let panStart = { x: 0, y: 0 };
      let clickStart = { x: 0, y: 0, time: 0 };
      let selectedElements = [];
      const originalStyles = new Map();

      if (!svg.getAttribute('viewBox')) {
        try {
          const b = svg.getBBox();
          if (b && b.width > 0 && b.height > 0) {
            svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
          } else {
            svg.setAttribute('viewBox', `0 0 ${svg.getAttribute('width') || 800} ${svg.getAttribute('height') || 600}`);
          }
        } catch (e) {
          svg.setAttribute('viewBox', `0 0 ${svg.getAttribute('width') || 800} ${svg.getAttribute('height') || 600}`);
        }
      }

      const getViewBox = () => {
        const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
        return { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
      };

      const setViewBox = (vb) => {
        svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
      };

      const onWheel = (e) => {
        if (!state.zoomEnabled) return;
        e.preventDefault();

        const rect = obj.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const vb = getViewBox();

        const svgMouseX = vb.x + (mouseX / rect.width) * vb.width;
        const svgMouseY = vb.y + (mouseY / rect.height) * vb.height;

        const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1;

        const newWidth = vb.width * zoomFactor;
        const newHeight = vb.height * zoomFactor;

        const newX = svgMouseX - (mouseX / rect.width) * newWidth;
        const newY = svgMouseY - (mouseY / rect.height) * newHeight;

        setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });

        if (state.callbacks.zoom) {
          state.callbacks.zoom({ zoomFactor, viewBox: getViewBox() });
        }
      };

      const onPointerDown = (e) => {
        if (e.button !== 0) return; 
        const target = e.target;
        const isInteractive = target.closest('[id^="curso-"], [id^="nodo-"], [id^="label-"]');

        if (state.panEnabled && (!state.selectEnabled || !isInteractive)) {
          panning = true;
          isDragging = false;
          panStart = { x: e.clientX, y: e.clientY };
          svg.setPointerCapture(e.pointerId);
        }

        clickStart = { x: e.clientX, y: e.clientY, time: Date.now() };
      };

      const onPointerMove = (e) => {
        if (panning) {
          const dx = e.clientX - panStart.x;
          const dy = e.clientY - panStart.y;

          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            isDragging = true;
          }

          const rect = obj.getBoundingClientRect();
          const vb = getViewBox();

          const scaleX = vb.width / rect.width;
          const scaleY = vb.height / rect.height;

          vb.x -= dx * scaleX;
          vb.y -= dy * scaleY;

          setViewBox(vb);

          panStart = { x: e.clientX, y: e.clientY };

          if (state.callbacks.pan) {
            state.callbacks.pan({ dx, dy, viewBox: vb });
          }
        }
      };

      const onPointerUp = (e) => {
        if (panning) {
          svg.releasePointerCapture(e.pointerId);
          panning = false;
        }
      };

      const clearSelectionInternal = () => {
        selectedElements.forEach(el => {
          if (originalStyles.has(el)) {
            const orig = originalStyles.get(el);
            if (orig.stroke === null) el.style.removeProperty('stroke');
            else el.style.stroke = orig.stroke;
            
            if (orig.strokeWidth === null) el.style.removeProperty('stroke-width');
            else el.style.strokeWidth = orig.strokeWidth;
          }
        });
        selectedElements = [];
        originalStyles.clear();
      };

      const selectElementInternal = (el) => {
        if (!originalStyles.has(el)) {
          originalStyles.set(el, {
            stroke: el.style.stroke || el.getAttribute('stroke'),
            strokeWidth: el.style.strokeWidth || el.getAttribute('stroke-width')
          });
        }
        el.style.stroke = state.selectionColor;
        el.style.strokeWidth = '3px';
        if (!selectedElements.includes(el)) {
          selectedElements.push(el);
        }
      };

      const onClick = (e) => {
        if (isDragging) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        const dx = e.clientX - clickStart.x;
        const dy = e.clientY - clickStart.y;
        const dt = Date.now() - clickStart.time;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5 || dt > 300) return;

        if (!state.selectEnabled) return;

        const group = e.target.closest('[id^="curso-"]');
        
        if (!e.shiftKey) {
          clearSelectionInternal();
        }

        if (group) {
          e.preventDefault();
          e.stopPropagation();

          if (e.shiftKey && selectedElements.includes(group)) {
            if (originalStyles.has(group)) {
              const orig = originalStyles.get(group);
              if (orig.stroke === null) group.style.removeProperty('stroke');
              else group.style.stroke = orig.stroke;
              if (orig.strokeWidth === null) group.style.removeProperty('stroke-width');
              else group.style.strokeWidth = orig.strokeWidth;
            }
            selectedElements = selectedElements.filter(el => el !== group);
          } else {
            selectElementInternal(group);
          }

          if (e.shiftKey) {
            if (state.callbacks.multiSelect) state.callbacks.multiSelect(selectedElements);
          } else {
            if (state.callbacks.select) state.callbacks.select(group);
          }
        } else {
          if (!e.shiftKey) {
            if (state.callbacks.select) state.callbacks.select(null);
          }
        }
      };

      const onDblClick = (e) => {
        if (!state.callbacks.dblclick) return;
        const group = e.target.closest('[id^="curso-"]');
        if (group) {
          state.callbacks.dblclick(group);
        }
      };

      const API = {
        getDataset: (tableName) => {
          if (!svgDoc) return null;
          const tableNode = svgDoc.querySelector(`metadata table[name="${tableName}"], metadata v\\:table[name="${tableName}"]`);
          if (!tableNode) return null;

          const columns = tableNode.getAttribute('columns').split(',');
          const primaryKey = tableNode.getAttribute('primaryKey');
          const rows = Array.from(tableNode.querySelectorAll('row, v\\:row')).map((rowNode, idx) => {
            const text = rowNode.textContent.trim();
            const values = text.split(',').map(v => v.trim());
            const data = {};
            columns.forEach((col, i) => {
              data[col] = values[i];
            });
            return {
              _rowId: rowNode.getAttribute('id') || String(idx),
              id: rowNode.getAttribute('id') || String(idx),
              hrefs: rowNode.getAttribute('hrefs') ? rowNode.getAttribute('hrefs').split(',').map(h => h.trim()) : [],
              data: data
            };
          });

          return { name: tableName, primaryKey, columns, rows };
        },

        select: (targetId, append = false) => {
          if (!append) clearSelectionInternal();
          const el = svgDoc.getElementById(targetId);
          if (el) {
            selectElementInternal(el);
          }
        },

        clearSelection: () => {
          clearSelectionInternal();
        },

        setCallback: (name, cb) => {
          if (name in state.callbacks) state.callbacks[name] = cb;
        }
      };

      svg.addEventListener('wheel', onWheel, { passive: false });
      svg.addEventListener('pointerdown', onPointerDown);
      svg.addEventListener('pointermove', onPointerMove);
      svg.addEventListener('pointerup', onPointerUp);
      svg.addEventListener('pointercancel', onPointerUp);
      svg.addEventListener('dblclick', onDblClick);
      svg.addEventListener('click', onClick, { capture: true });

      obj.__SVGControl = API;

      // ====================================================
      // LÍNEA PUENTE COMPATIBLE CON EL ENUNCIADO DEL TEC (ODViz)
      // ====================================================
      if (window.parent && typeof window.parent.setupODViz === 'function') {
        const dataset = API.getDataset('cursos');
        window.parent.setupODViz(dataset, API);
      }

      cleanup = () => {
        svg.removeEventListener('wheel', onWheel);
        svg.removeEventListener('pointerdown', onPointerDown);
        svg.removeEventListener('pointermove', onPointerMove);
        svg.removeEventListener('pointerup', onPointerUp);
        svg.removeEventListener('pointercancel', onPointerUp);
        svg.removeEventListener('dblclick', onDblClick);
        svg.removeEventListener('click', onClick, { capture: true });
        try { delete obj.__SVGControl; } catch (e) { obj.__SVGControl = undefined; }
      };
    };

    try {
      if (obj.contentDocument && obj.contentDocument.readyState === 'complete') setup();
      else obj.addEventListener('load', setup, { once: true });
    } catch (err) {
      console.error('Initialization failed: Access to contentDocument denied', err);
    }
  };

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
(function() {
  /* @license
  morris.js v0.5.1
  Copyright 2025 Olly Smith All rights reserved.
  Licensed under the BSD-2-Clause License.
  */
  var $, Morris, minutesSpecHelper, ref, ref1, ref2, ref3, ref4, secondsSpecHelper,
    boundMethodCheck = function(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new Error('Bound instance method accessed before binding'); } },
    indexOf = [].indexOf;

  Morris = window.Morris = {};

  $ = jQuery;

  // Very simple event-emitter class.

  // @private
  Morris.EventEmitter = class EventEmitter {
    on(name, handler) {
      if (this.handlers == null) {
        this.handlers = {};
      }
      if (this.handlers[name] == null) {
        this.handlers[name] = [];
      }
      this.handlers[name].push(handler);
      return this;
    }

    fire(name, ...args) {
      var handler, k, len, ref, results;
      if ((this.handlers != null) && (this.handlers[name] != null)) {
        ref = this.handlers[name];
        results = [];
        for (k = 0, len = ref.length; k < len; k++) {
          handler = ref[k];
          results.push(handler(...args));
        }
        return results;
      }
    }

  };

  // Make long numbers prettier by inserting commas.

  // @example
  //   Morris.commas(1234567) -> '1,234,567'
  Morris.commas = function(num) {
    var absnum, intnum, ret, strabsnum;
    if (num != null) {
      ret = num < 0 ? "-" : "";
      absnum = Math.abs(num);
      intnum = Math.floor(absnum).toFixed(0);
      ret += intnum.replace(/(?=(?:\d{3})+$)(?!^)/g, ',');
      strabsnum = absnum.toString();
      if (strabsnum.length > intnum.length) {
        ret += strabsnum.slice(intnum.length);
      }
      return ret;
    } else {
      return '-';
    }
  };

  // Zero-pad numbers to two characters wide.

  // @example
  //   Morris.pad2(1) -> '01'
  Morris.pad2 = function(number) {
    return (number < 10 ? '0' : '') + number;
  };

  ref = Morris.Grid = (function() {
    class Grid extends Morris.EventEmitter {
      // A generic pair of axes for line/area/bar charts.

      // Draws grid lines and axis labels.

      constructor(options) {
        super();
        this.resizeHandler = this.resizeHandler.bind(this);
        this.hasToShow = this.hasToShow.bind(this);
        // find the container to draw the graph in
        if (typeof options.element === 'string') {
          this.el = $(document.getElementById(options.element));
        } else {
          this.el = $(options.element);
        }
        if ((this.el == null) || this.el.length === 0) {
          throw new Error("Graph container element not found");
        }
        if (this.el.css('position') === 'static') {
          this.el.css('position', 'relative');
        }
        this.options = $.extend({}, this.gridDefaults, this.defaults || {}, options);
        // backwards compatibility for units -> postUnits
        if (typeof this.options.units === 'string') {
          this.options.postUnits = options.units;
        }
        // the raphael drawing instance
        this.raphael = new Raphael(this.el[0]);
        // some redraw stuff
        this.elementWidth = null;
        this.elementHeight = null;
        this.dirty = false;
        // range selection
        this.selectFrom = null;
        if (this.init) {
          // more stuff
          this.init();
        }
        // load data
        this.setData(this.options.data);
        // hover
        this.el.bind('mousemove', (evt) => {
          var left, offset, right, width, x;
          offset = this.el.offset();
          x = evt.pageX - offset.left;
          if (this.selectFrom) {
            left = this.data[this.hitTest(Math.min(x, this.selectFrom))]._x;
            right = this.data[this.hitTest(Math.max(x, this.selectFrom))]._x;
            width = right - left;
            return this.selectionRect.attr({
              x: left,
              width: width
            });
          } else {
            return this.fire('hovermove', x, evt.pageY - offset.top);
          }
        });
        this.el.bind('mouseleave', (evt) => {
          if (this.selectFrom) {
            this.selectionRect.hide();
            this.selectFrom = null;
          }
          return this.fire('hoverout');
        });
        this.el.bind('touchstart touchmove touchend', (evt) => {
          var offset, touch;
          touch = evt.originalEvent.touches[0] || evt.originalEvent.changedTouches[0];
          offset = this.el.offset();
          return this.fire('hovermove', touch.pageX - offset.left, touch.pageY - offset.top);
        });
        this.el.bind('click', (evt) => {
          var offset;
          offset = this.el.offset();
          return this.fire('gridclick', evt.pageX - offset.left, evt.pageY - offset.top);
        });
        if (this.options.rangeSelect) {
          this.selectionRect = this.raphael.rect(0, 0, 0, this.el.innerHeight()).attr({
            fill: this.options.rangeSelectColor,
            stroke: false
          }).toBack().hide();
          this.el.bind('mousedown', (evt) => {
            var offset;
            offset = this.el.offset();
            return this.startRange(evt.pageX - offset.left);
          });
          this.el.bind('mouseup', (evt) => {
            var offset;
            offset = this.el.offset();
            this.endRange(evt.pageX - offset.left);
            return this.fire('hovermove', evt.pageX - offset.left, evt.pageY - offset.top);
          });
        }
        if (this.options.resize) {
          $(window).bind('resize', (evt) => {
            if (this.timeoutId != null) {
              window.clearTimeout(this.timeoutId);
            }
            return this.timeoutId = window.setTimeout(this.resizeHandler, 100);
          });
        }
        // Disable tap highlight on iOS.
        this.el.css('-webkit-tap-highlight-color', 'rgba(0,0,0,0)');
        if (this.postInit) {
          this.postInit();
        }
      }

      // Update the data series and redraw the chart.

      setData(data, redraw = true) {
        var e, flatEvents, from, idx, index, k, len, maxGoal, minGoal, ref1, ref2, ret, row, step, to, total, y, ykey, ymax, ymin, yval;
        this.options.data = data;
        if ((data == null) || data.length === 0) {
          this.data = [];
          this.raphael.clear();
          if (this.hover != null) {
            this.hover.hide();
          }
          return;
        }
        ymax = this.cumulative ? 0 : null;
        ymin = this.cumulative ? 0 : null;
        if (this.options.goals.length > 0) {
          minGoal = Math.min(...this.options.goals);
          maxGoal = Math.max(...this.options.goals);
          ymin = ymin != null ? Math.min(ymin, minGoal) : minGoal;
          ymax = ymax != null ? Math.max(ymax, maxGoal) : maxGoal;
        }
        this.data = (function() {
          var k, len, results;
          results = [];
          for (index = k = 0, len = data.length; k < len; index = ++k) {
            row = data[index];
            ret = {
              src: row
            };
            ret.label = row[this.options.xkey];
            if (this.options.parseTime) {
              ret.x = Morris.parseDate(ret.label);
              if (this.options.dateFormat) {
                ret.label = this.options.dateFormat(ret.x);
              } else if (typeof ret.label === 'number') {
                ret.label = new Date(ret.label).toString();
              }
            } else if (this.options.freePosition) {
              ret.x = parseFloat(row[this.options.xkey]);
              if (this.options.xLabelFormat) {
                ret.label = this.options.xLabelFormat(ret);
              }
            } else {
              ret.x = index;
              if (this.options.xLabelFormat) {
                ret.label = this.options.xLabelFormat(ret);
              }
            }
            total = 0;
            ret.y = (function() {
              var len1, ref1, results1, u;
              ref1 = this.options.ykeys;
              results1 = [];
              for (idx = u = 0, len1 = ref1.length; u < len1; idx = ++u) {
                ykey = ref1[idx];
                yval = row[ykey];
                if (typeof yval === 'string') {
                  yval = parseFloat(yval);
                }
                if ((yval != null) && typeof yval !== 'number') {
                  yval = null;
                }
                if ((yval != null) && this.hasToShow(idx)) {
                  if (this.cumulative) {
                    total += yval;
                  } else {
                    if (ymax != null) {
                      ymax = Math.max(yval, ymax);
                      ymin = Math.min(yval, ymin);
                    } else {
                      ymax = ymin = yval;
                    }
                  }
                }
                if (this.cumulative && (total != null)) {
                  ymax = Math.max(total, ymax);
                  ymin = Math.min(total, ymin);
                }
                results1.push(yval);
              }
              return results1;
            }).call(this);
            results.push(ret);
          }
          return results;
        }).call(this);
        if (this.options.parseTime || this.options.freePosition) {
          this.data = this.data.sort(function(a, b) {
            return (a.x > b.x) - (b.x > a.x);
          });
        }
        // calculate horizontal range of the graph
        this.xmin = this.data[0].x;
        this.xmax = this.data[this.data.length - 1].x;
        this.events = [];
        if (this.options.events.length > 0) {
          if (this.options.parseTime) {
            ref1 = this.options.events;
            for (k = 0, len = ref1.length; k < len; k++) {
              e = ref1[k];
              if (e instanceof Array) {
                [from, to] = e;
                this.events.push([Morris.parseDate(from), Morris.parseDate(to)]);
              } else {
                this.events.push(Morris.parseDate(e));
              }
            }
          } else {
            this.events = this.options.events;
          }
          flatEvents = $.map(this.events, function(e) {
            return e;
          });
          this.xmax = Math.max(this.xmax, Math.max(...flatEvents));
          this.xmin = Math.min(this.xmin, Math.min(...flatEvents));
        }
        if (this.xmin === this.xmax) {
          this.xmin -= 1;
          this.xmax += 1;
        }
        this.ymin = this.yboundary('min', ymin);
        this.ymax = this.yboundary('max', ymax);
        if (this.ymin === this.ymax) {
          if (ymin) {
            this.ymin -= 1;
          }
          this.ymax += 1;
        }
        if (((ref2 = this.options.axes) === true || ref2 === 'both' || ref2 === 'y') || this.options.grid === true) {
          if (this.options.ymax === this.gridDefaults.ymax && this.options.ymin === this.gridDefaults.ymin) {
            // calculate 'magic' grid placement
            this.grid = this.autoGridLines(this.ymin, this.ymax, this.options.numLines);
            this.ymin = Math.min(this.ymin, this.grid[0]);
            this.ymax = Math.max(this.ymax, this.grid[this.grid.length - 1]);
          } else {
            step = (this.ymax - this.ymin) / (this.options.numLines - 1);
            this.grid = (function() {
              var ref3, ref4, ref5, results, u;
              results = [];
              for (y = u = ref3 = this.ymin, ref4 = this.ymax, ref5 = step; ref5 !== 0 && (ref5 > 0 ? u <= ref4 : u >= ref4); y = u += ref5) {
                results.push(y);
              }
              return results;
            }).call(this);
          }
        }
        this.dirty = true;
        if (redraw) {
          return this.redraw();
        }
      }

      yboundary(boundaryType, currentValue) {
        var boundaryOption, suggestedValue;
        boundaryOption = this.options[`y${boundaryType}`];
        if (typeof boundaryOption === 'string') {
          if (boundaryOption.slice(0, 4) === 'auto') {
            if (boundaryOption.length > 5) {
              suggestedValue = parseInt(boundaryOption.slice(5), 10);
              if (currentValue == null) {
                return suggestedValue;
              }
              return Math[boundaryType](currentValue, suggestedValue);
            } else {
              if (currentValue != null) {
                return currentValue;
              } else {
                return 0;
              }
            }
          } else {
            return parseInt(boundaryOption, 10);
          }
        } else {
          return boundaryOption;
        }
      }

      autoGridLines(ymin, ymax, nlines) {
        var gmax, gmin, grid, smag, span, step, unit, y, ymag;
        span = ymax - ymin;
        ymag = Math.floor(Math.log(span) / Math.log(10));
        unit = Math.pow(10, ymag);
        // calculate initial grid min and max values
        gmin = Math.floor(ymin / unit) * unit;
        gmax = Math.ceil(ymax / unit) * unit;
        step = (gmax - gmin) / (nlines - 1);
        if (unit === 1 && step > 1 && Math.ceil(step) !== step) {
          step = Math.ceil(step);
          gmax = gmin + step * (nlines - 1);
        }
        // ensure zero is plotted where the range includes zero
        if (gmin < 0 && gmax > 0) {
          gmin = Math.floor(ymin / step) * step;
          gmax = Math.ceil(ymax / step) * step;
        }
        // special case for decimal numbers
        if (step < 1) {
          smag = Math.floor(Math.log(step) / Math.log(10));
          grid = (function() {
            var k, ref1, ref2, ref3, results;
            results = [];
            for (y = k = ref1 = gmin, ref2 = gmax, ref3 = step; ref3 !== 0 && (ref3 > 0 ? k <= ref2 : k >= ref2); y = k += ref3) {
              results.push(parseFloat(y.toFixed(1 - smag)));
            }
            return results;
          })();
        } else {
          grid = (function() {
            var k, ref1, ref2, ref3, results;
            results = [];
            for (y = k = ref1 = gmin, ref2 = gmax, ref3 = step; ref3 !== 0 && (ref3 > 0 ? k <= ref2 : k >= ref2); y = k += ref3) {
              results.push(y);
            }
            return results;
          })();
        }
        return grid;
      }

      _calc() {
        var angle, bottomOffsets, gridLine, h, i, ref1, ref2, w, yLabelWidths;
        w = this.el.width();
        h = this.el.height();
        if (this.elementWidth !== w || this.elementHeight !== h || this.dirty) {
          this.elementWidth = w;
          this.elementHeight = h;
          this.dirty = false;
          // recalculate grid dimensions
          this.left = this.options.padding;
          this.right = this.elementWidth - this.options.padding;
          this.top = this.options.padding;
          this.bottom = this.elementHeight - this.options.padding;
          if ((ref1 = this.options.axes) === true || ref1 === 'both' || ref1 === 'y') {
            yLabelWidths = (function() {
              var k, len, ref2, results;
              ref2 = this.grid;
              results = [];
              for (k = 0, len = ref2.length; k < len; k++) {
                gridLine = ref2[k];
                results.push(this.measureText(this.yAxisFormat(gridLine)).width);
              }
              return results;
            }).call(this);
            if (!this.options.horizontal) {
              this.left += Math.max(...yLabelWidths);
            } else {
              this.bottom -= Math.max(...yLabelWidths);
            }
          }
          if ((ref2 = this.options.axes) === true || ref2 === 'both' || ref2 === 'x') {
            if (!this.options.horizontal) {
              angle = -this.options.xLabelAngle;
            } else {
              angle = -90;
            }
            bottomOffsets = (function() {
              var k, ref3, results;
              results = [];
              for (i = k = 0, ref3 = this.data.length; (0 <= ref3 ? k < ref3 : k > ref3); i = 0 <= ref3 ? ++k : --k) {
                results.push(this.measureText(this.data[i].label, angle).height);
              }
              return results;
            }).call(this);
            if (!this.options.horizontal) {
              this.bottom -= Math.max(...bottomOffsets);
            } else {
              this.left += Math.max(...bottomOffsets);
            }
          }
          this.width = Math.max(1, this.right - this.left);
          this.height = Math.max(1, this.bottom - this.top);
          if (!this.options.horizontal) {
            this.dx = this.width / (this.xmax - this.xmin);
            this.dy = this.height / (this.ymax - this.ymin);
            this.yStart = this.bottom;
            this.yEnd = this.top;
            this.xStart = this.left;
            this.xEnd = this.right;
            this.xSize = this.width;
            this.ySize = this.height;
          } else {
            this.dx = this.height / (this.xmax - this.xmin);
            this.dy = this.width / (this.ymax - this.ymin);
            this.yStart = this.left;
            this.yEnd = this.right;
            this.xStart = this.top;
            this.xEnd = this.bottom;
            this.xSize = this.height;
            this.ySize = this.width;
          }
          if (this.calc) {
            return this.calc();
          }
        }
      }

      // Quick translation helpers

      transY(y) {
        if (!this.options.horizontal) {
          return this.bottom - (y - this.ymin) * this.dy;
        } else {
          return this.left + (y - this.ymin) * this.dy;
        }
      }

      transX(x) {
        if (this.data.length === 1) {
          return (this.xStart + this.xEnd) / 2;
        } else {
          return this.xStart + (x - this.xmin) * this.dx;
        }
      }

      // Draw it!

      // If you need to re-size your charts, call this method after changing the
      // size of the container element.
      redraw() {
        this.raphael.clear();
        this._calc();
        this.drawGrid();
        this.drawGoals();
        this.drawEvents();
        if (this.draw) {
          return this.draw();
        }
      }

      // @private

      measureText(text, angle = 0) {
        var ret, tt;
        tt = this.raphael.text(100, 100, text).attr('font-size', this.options.gridTextSize).attr('font-family', this.options.gridTextFamily).attr('font-weight', this.options.gridTextWeight).rotate(angle);
        ret = tt.getBBox();
        tt.remove();
        return ret;
      }

      // @private

      yAxisFormat(label) {
        return this.yLabelFormat(label, 0);
      }

      // @private

      yLabelFormat(label, i) {
        if (typeof this.options.yLabelFormat === 'function') {
          return this.options.yLabelFormat(label, i);
        } else {
          return `${this.options.preUnits}${Morris.commas(label)}${this.options.postUnits}`;
        }
      }

      // get the X position of a label on the Y axis

      // @private
      getYAxisLabelX() {
        if (this.options.yLabelAlign === 'right') {
          return this.left - this.options.padding / 2;
        } else {
          return this.options.padding / 2;
        }
      }

      // draw y axis labels, horizontal lines

      drawGrid() {
        var basePos, k, len, lineY, pos, ref1, ref2, ref3, results;
        if (this.options.grid === false && ((ref1 = this.options.axes) !== true && ref1 !== 'both' && ref1 !== 'y')) {
          return;
        }
        if (!this.options.horizontal) {
          basePos = this.getYAxisLabelX();
        } else {
          basePos = this.getXAxisLabelY();
        }
        ref2 = this.grid;
        results = [];
        for (k = 0, len = ref2.length; k < len; k++) {
          lineY = ref2[k];
          pos = this.transY(lineY);
          if ((ref3 = this.options.axes) === true || ref3 === 'both' || ref3 === 'y') {
            if (!this.options.horizontal) {
              this.drawYAxisLabel(basePos, pos, this.yAxisFormat(lineY));
            } else {
              this.drawXAxisLabel(pos, basePos, this.yAxisFormat(lineY));
            }
          }
          if (this.options.grid) {
            pos = Math.floor(pos) + 0.5;
            if (!this.options.horizontal) {
              results.push(this.drawGridLine(`M${this.xStart},${pos}H${this.xEnd}`));
            } else {
              results.push(this.drawGridLine(`M${pos},${this.xStart}V${this.xEnd}`));
            }
          } else {
            results.push(void 0);
          }
        }
        return results;
      }

      // draw goals horizontal lines

      drawGoals() {
        var color, goal, i, k, len, ref1, results;
        ref1 = this.options.goals;
        results = [];
        for (i = k = 0, len = ref1.length; k < len; i = ++k) {
          goal = ref1[i];
          color = this.options.goalLineColors[i % this.options.goalLineColors.length];
          results.push(this.drawGoal(goal, color));
        }
        return results;
      }

      // draw events vertical lines
      drawEvents() {
        var color, event, i, k, len, ref1, results;
        ref1 = this.events;
        results = [];
        for (i = k = 0, len = ref1.length; k < len; i = ++k) {
          event = ref1[i];
          color = this.options.eventLineColors[i % this.options.eventLineColors.length];
          results.push(this.drawEvent(event, color));
        }
        return results;
      }

      drawGoal(goal, color) {
        var path, y;
        y = Math.floor(this.transY(goal)) + 0.5;
        if (!this.options.horizontal) {
          path = `M${this.xStart},${y}H${this.xEnd}`;
        } else {
          path = `M${y},${this.xStart}V${this.xEnd}`;
        }
        return this.raphael.path(path).attr('stroke', color).attr('stroke-width', this.options.goalStrokeWidth);
      }

      drawEvent(event, color) {
        var from, path, to, x;
        if (event instanceof Array) {
          [from, to] = event;
          from = Math.floor(this.transX(from)) + 0.5;
          to = Math.floor(this.transX(to)) + 0.5;
          if (!this.options.horizontal) {
            return this.raphael.rect(from, this.yEnd, to - from, this.yStart - this.yEnd).attr({
              fill: color,
              stroke: false
            }).toBack();
          } else {
            return this.raphael.rect(this.yStart, from, this.yEnd - this.yStart, to - from).attr({
              fill: color,
              stroke: false
            }).toBack();
          }
        } else {
          x = Math.floor(this.transX(event)) + 0.5;
          if (!this.options.horizontal) {
            path = `M${x},${this.yStart}V${this.yEnd}`;
          } else {
            path = `M${this.yStart},${x}H${this.yEnd}`;
          }
          return this.raphael.path(path).attr('stroke', color).attr('stroke-width', this.options.eventStrokeWidth);
        }
      }

      drawYAxisLabel(xPos, yPos, text) {
        var label;
        label = this.raphael.text(xPos, yPos, text).attr('font-size', this.options.gridTextSize).attr('font-family', this.options.gridTextFamily).attr('font-weight', this.options.gridTextWeight).attr('fill', this.options.gridTextColor);
        if (this.options.yLabelAlign === 'right') {
          return label.attr('text-anchor', 'end');
        } else {
          return label.attr('text-anchor', 'start');
        }
      }

      drawXAxisLabel(xPos, yPos, text) {
        return this.raphael.text(xPos, yPos, text).attr('font-size', this.options.gridTextSize).attr('font-family', this.options.gridTextFamily).attr('font-weight', this.options.gridTextWeight).attr('fill', this.options.gridTextColor);
      }

      drawGridLine(path) {
        return this.raphael.path(path).attr('stroke', this.options.gridLineColor).attr('stroke-width', this.options.gridStrokeWidth);
      }

      // Range selection

      startRange(x) {
        this.hover.hide();
        this.selectFrom = x;
        return this.selectionRect.attr({
          x: x,
          width: 0
        }).show();
      }

      endRange(x) {
        var end, start;
        if (this.selectFrom) {
          start = Math.min(this.selectFrom, x);
          end = Math.max(this.selectFrom, x);
          this.options.rangeSelect.call(this.el, {
            start: this.data[this.hitTest(start)].x,
            end: this.data[this.hitTest(end)].x
          });
          return this.selectFrom = null;
        }
      }

      resizeHandler() {
        boundMethodCheck(this, ref);
        this.timeoutId = null;
        this.raphael.setSize(this.el.width(), this.el.height());
        return this.redraw();
      }

      hasToShow(i) {
        boundMethodCheck(this, ref);
        return this.options.shown === true || this.options.shown[i] === true;
      }

    };

    // Default options

    Grid.prototype.gridDefaults = {
      dateFormat: null,
      axes: true,
      freePosition: false,
      grid: true,
      gridLineColor: '#aaa',
      gridStrokeWidth: 0.5,
      gridTextColor: '#888',
      gridTextSize: 12,
      gridTextFamily: 'sans-serif',
      gridTextWeight: 'normal',
      hideHover: false,
      yLabelFormat: null,
      yLabelAlign: 'right',
      xLabelAngle: 0,
      numLines: 5,
      padding: 25,
      parseTime: true,
      postUnits: '',
      preUnits: '',
      ymax: 'auto',
      ymin: 'auto 0',
      goals: [],
      goalStrokeWidth: 1.0,
      goalLineColors: ['#666633', '#999966', '#cc6666', '#663333'],
      events: [],
      eventStrokeWidth: 1.0,
      eventLineColors: ['#005a04', '#ccffbb', '#3a5f0b', '#005502'],
      rangeSelect: null,
      rangeSelectColor: '#eef',
      resize: false
    };

    return Grid;

  }).call(this);

  // Parse a date into a javascript timestamp

  Morris.parseDate = function(date) {
    var isecs, m, msecs, n, o, offsetmins, p, q, r, ret, secs;
    if (typeof date === 'number') {
      return date;
    }
    m = date.match(/^(\d+) Q(\d)$/);
    n = date.match(/^(\d+)-(\d+)$/);
    o = date.match(/^(\d+)-(\d+)-(\d+)$/);
    p = date.match(/^(\d+) W(\d+)$/);
    q = date.match(/^(\d+)-(\d+)-(\d+)[ T](\d+):(\d+)(Z|([+-])(\d\d):?(\d\d))?$/);
    r = date.match(/^(\d+)-(\d+)-(\d+)[ T](\d+):(\d+):(\d+(\.\d+)?)(Z|([+-])(\d\d):?(\d\d))?$/);
    if (m) {
      return new Date(parseInt(m[1], 10), parseInt(m[2], 10) * 3 - 1, 1).getTime();
    } else if (n) {
      return new Date(parseInt(n[1], 10), parseInt(n[2], 10) - 1, 1).getTime();
    } else if (o) {
      return new Date(parseInt(o[1], 10), parseInt(o[2], 10) - 1, parseInt(o[3], 10)).getTime();
    } else if (p) {
      // calculate number of weeks in year given
      ret = new Date(parseInt(p[1], 10), 0, 1);
      if (ret.getDay() !== 4) {
        ret.setMonth(0, 1 + ((4 - ret.getDay()) + 7) % 7);
      }
      // add weeks
      return ret.getTime() + parseInt(p[2], 10) * 604800000;
    } else if (q) {
      if (!q[6]) {
        // no timezone info, use local
        return new Date(parseInt(q[1], 10), parseInt(q[2], 10) - 1, parseInt(q[3], 10), parseInt(q[4], 10), parseInt(q[5], 10)).getTime();
      } else {
        // timezone info supplied, use UTC
        offsetmins = 0;
        if (q[6] !== 'Z') {
          offsetmins = parseInt(q[8], 10) * 60 + parseInt(q[9], 10);
          if (q[7] === '+') {
            offsetmins = 0 - offsetmins;
          }
        }
        return Date.UTC(parseInt(q[1], 10), parseInt(q[2], 10) - 1, parseInt(q[3], 10), parseInt(q[4], 10), parseInt(q[5], 10) + offsetmins);
      }
    } else if (r) {
      secs = parseFloat(r[6]);
      isecs = Math.floor(secs);
      msecs = Math.round((secs - isecs) * 1000);
      if (!r[8]) {
        // no timezone info, use local
        return new Date(parseInt(r[1], 10), parseInt(r[2], 10) - 1, parseInt(r[3], 10), parseInt(r[4], 10), parseInt(r[5], 10), isecs, msecs).getTime();
      } else {
        // timezone info supplied, use UTC
        offsetmins = 0;
        if (r[8] !== 'Z') {
          offsetmins = parseInt(r[10], 10) * 60 + parseInt(r[11], 10);
          if (r[9] === '+') {
            offsetmins = 0 - offsetmins;
          }
        }
        return Date.UTC(parseInt(r[1], 10), parseInt(r[2], 10) - 1, parseInt(r[3], 10), parseInt(r[4], 10), parseInt(r[5], 10) + offsetmins, isecs, msecs);
      }
    } else {
      return new Date(parseInt(date, 10), 0, 1).getTime();
    }
  };

  Morris.Hover = (function() {
    class Hover {
      constructor(options = {}) {
        this.options = $.extend({}, Morris.Hover.defaults, options);
        this.el = $(`<div class='${this.options.class}'></div>`);
        this.el.hide();
        this.options.parent.append(this.el);
      }

      update(html, x, y, centre_y) {
        if (!html) {
          return this.hide();
        } else {
          this.html(html);
          this.show();
          return this.moveTo(x, y, centre_y);
        }
      }

      html(content) {
        return this.el.html(content);
      }

      moveTo(x, y, centre_y) {
        var hoverHeight, hoverWidth, left, parentHeight, parentWidth, top;
        parentWidth = this.options.parent.innerWidth();
        parentHeight = this.options.parent.innerHeight();
        hoverWidth = this.el.outerWidth();
        hoverHeight = this.el.outerHeight();
        left = Math.min(Math.max(0, x - hoverWidth / 2), parentWidth - hoverWidth);
        if (y != null) {
          if (centre_y === true) {
            top = y - hoverHeight / 2;
            if (top < 0) {
              top = 0;
            }
          } else {
            top = y - hoverHeight - 10;
            if (top < 0) {
              top = y + 10;
              if (top + hoverHeight > parentHeight) {
                top = parentHeight / 2 - hoverHeight / 2;
              }
            }
          }
        } else {
          top = parentHeight / 2 - hoverHeight / 2;
        }
        return this.el.css({
          left: left + "px",
          top: parseInt(top) + "px"
        });
      }

      show() {
        return this.el.show();
      }

      hide() {
        return this.el.hide();
      }

    };

    // Displays contextual information in a floating HTML div.
    Hover.defaults = {
      class: 'morris-hover morris-default-style'
    };

    return Hover;

  }).call(this);

  ref1 = Morris.Line = (function() {
    class Line extends Morris.Grid {
      // Initialise the graph.

      constructor(options) {
        super(options);
        // click on grid event handler

        // @private
        this.onGridClick = this.onGridClick.bind(this);
        // hover movement event handler

        // @private
        this.onHoverMove = this.onHoverMove.bind(this);
        // hover out event handler

        // @private
        this.onHoverOut = this.onHoverOut.bind(this);
        // @private
        this.hilight = this.hilight.bind(this);
      }

      init() {
        // Some instance variables for later
        if (this.options.hideHover !== 'always') {
          this.hover = new Morris.Hover({
            parent: this.el
          });
          this.on('hovermove', this.onHoverMove);
          this.on('hoverout', this.onHoverOut);
          return this.on('gridclick', this.onGridClick);
        }
      }

      // Do any size-related calculations

      // @private
      calc() {
        this.calcPoints();
        return this.generatePaths();
      }

      // calculate series data point coordinates

      // @private
      calcPoints() {
        var i, k, len, ref2, results, row, y;
        ref2 = this.data;
        results = [];
        for (k = 0, len = ref2.length; k < len; k++) {
          row = ref2[k];
          row._x = this.transX(row.x);
          row._y = (function() {
            var len1, ref3, results1, u;
            ref3 = row.y;
            results1 = [];
            for (u = 0, len1 = ref3.length; u < len1; u++) {
              y = ref3[u];
              if (y != null) {
                results1.push(this.transY(y));
              } else {
                results1.push(y);
              }
            }
            return results1;
          }).call(this);
          results.push(row._ymax = Math.min(...[this.bottom].concat((function() {
            var len1, ref3, results1, u;
            ref3 = row._y;
            results1 = [];
            for (i = u = 0, len1 = ref3.length; u < len1; i = ++u) {
              y = ref3[i];
              if ((y != null) && this.hasToShow(i)) {
                results1.push(y);
              }
            }
            return results1;
          }).call(this))));
        }
        return results;
      }

      // hit test - returns the index of the row at the given x-coordinate

      hitTest(x) {
        var index, k, len, r, ref2;
        if (this.data.length === 0) {
          return null;
        }
        ref2 = this.data.slice(1);
        // TODO better search algo
        for (index = k = 0, len = ref2.length; k < len; index = ++k) {
          r = ref2[index];
          if (x < (r._x + this.data[index]._x) / 2) {
            break;
          }
        }
        return index;
      }

      onGridClick(x, y) {
        var index;
        boundMethodCheck(this, ref1);
        index = this.hitTest(x);
        return this.fire('click', index, this.data[index].src, x, y);
      }

      onHoverMove(x, y) {
        var index;
        boundMethodCheck(this, ref1);
        index = this.hitTest(x);
        return this.displayHoverForRow(index);
      }

      onHoverOut() {
        boundMethodCheck(this, ref1);
        if (this.options.hideHover !== false) {
          return this.displayHoverForRow(null);
        }
      }

      // display a hover popup over the given row

      // @private
      displayHoverForRow(index) {
        if (index != null) {
          this.hover.update(...this.hoverContentForRow(index));
          return this.hilight(index);
        } else {
          this.hover.hide();
          return this.hilight();
        }
      }

      // hover content for a point

      // @private
      hoverContentForRow(index) {
        var content, j, k, len, ref2, row, y;
        row = this.data[index];
        content = $("<div class='morris-hover-row-label'>").text(row.label);
        content = content.prop('outerHTML');
        ref2 = row.y;
        for (j = k = 0, len = ref2.length; k < len; j = ++k) {
          y = ref2[j];
          if (this.options.labels[j] === false) {
            continue;
          }
          content += `<div class='morris-hover-point' style='color: ${this.colorFor(row, j, 'label')}'>
  ${this.options.labels[j]}:
  ${this.yLabelFormat(y, j)}
</div>`;
        }
        if (typeof this.options.hoverCallback === 'function') {
          content = this.options.hoverCallback(index, this.options, content, row.src);
        }
        return [content, row._x, row._ymax];
      }

      // generate paths for series lines

      // @private
      generatePaths() {
        var coords, i, r, smooth;
        return this.paths = (function() {
          var k, ref2, ref3, results;
          results = [];
          for (i = k = 0, ref2 = this.options.ykeys.length; (0 <= ref2 ? k < ref2 : k > ref2); i = 0 <= ref2 ? ++k : --k) {
            smooth = typeof this.options.smooth === "boolean" ? this.options.smooth : (ref3 = this.options.ykeys[i], indexOf.call(this.options.smooth, ref3) >= 0);
            coords = (function() {
              var len, ref4, results1, u;
              ref4 = this.data;
              results1 = [];
              for (u = 0, len = ref4.length; u < len; u++) {
                r = ref4[u];
                if (r._y[i] !== void 0) {
                  results1.push({
                    x: r._x,
                    y: r._y[i]
                  });
                }
              }
              return results1;
            }).call(this);
            if (coords.length > 1) {
              results.push(Morris.Line.createPath(coords, smooth, this.bottom));
            } else {
              results.push(null);
            }
          }
          return results;
        }).call(this);
      }

      // Draws the line chart.

      draw() {
        var ref2;
        if ((ref2 = this.options.axes) === true || ref2 === 'both' || ref2 === 'x') {
          this.drawXAxis();
        }
        this.drawSeries();
        if (this.options.hideHover === false) {
          return this.displayHoverForRow(this.data.length - 1);
        }
      }

      // draw the x-axis labels

      // @private
      drawXAxis() {
        var drawLabel, k, l, labels, len, len1, lines, prevAngleMargin, prevLabelMargin, results, row, u, ypos;
        // draw x axis labels
        ypos = this.bottom + this.options.padding / 2;
        prevLabelMargin = null;
        prevAngleMargin = null;
        drawLabel = (labelText, xpos) => {
          var label, labelBox, margin, offset, textBox;
          label = this.drawXAxisLabel(this.transX(xpos), ypos, labelText);
          textBox = label.getBBox();
          label.transform(`r${-this.options.xLabelAngle}`);
          labelBox = label.getBBox();
          label.transform(`t0,${labelBox.height / 2}...`);
          if (this.options.xLabelAngle !== 0) {
            offset = -0.5 * textBox.width * Math.cos(this.options.xLabelAngle * Math.PI / 180.0);
            label.transform(`t${offset},0...`);
          }
          // try to avoid overlaps
          labelBox = label.getBBox();
          if (((prevLabelMargin == null) || prevLabelMargin >= labelBox.x + labelBox.width || (prevAngleMargin != null) && prevAngleMargin >= labelBox.x) && labelBox.x >= 0 && (labelBox.x + labelBox.width) < this.el.width()) {
            if (this.options.xLabelAngle !== 0) {
              margin = 1.25 * this.options.gridTextSize / Math.sin(this.options.xLabelAngle * Math.PI / 180.0);
              prevAngleMargin = labelBox.x - margin;
            }
            prevLabelMargin = labelBox.x - this.options.xLabelMargin;
            if (this.options.verticalGrid === true) {
              return this.drawVerticalGridLine(xpos);
            }
          } else {
            return label.remove();
          }
        };
        if (this.options.parseTime) {
          if (this.data.length === 1 && this.options.xLabels === 'auto') {
            // where there's only one value in the series, we can't make a
            // sensible guess for an x labelling scheme, so just use the original
            // column label
            labels = [[this.data[0].label, this.data[0].x]];
          } else {
            labels = Morris.labelSeries(this.xmin, this.xmax, this.width, this.options.xLabels, this.options.xLabelFormat);
          }
        } else if (this.options.customLabels) {
          labels = (function() {
            var k, len, ref2, results;
            ref2 = this.options.customLabels;
            results = [];
            for (k = 0, len = ref2.length; k < len; k++) {
              row = ref2[k];
              results.push([row.label, row.x]);
            }
            return results;
          }).call(this);
        } else {
          labels = (function() {
            var k, len, ref2, results;
            ref2 = this.data;
            results = [];
            for (k = 0, len = ref2.length; k < len; k++) {
              row = ref2[k];
              results.push([row.label, row.x]);
            }
            return results;
          }).call(this);
        }
        labels.reverse();
        for (k = 0, len = labels.length; k < len; k++) {
          l = labels[k];
          drawLabel(l[0], l[1]);
        }
        if (typeof this.options.verticalGrid === 'string') {
          lines = Morris.labelSeries(this.xmin, this.xmax, this.width, this.options.verticalGrid);
          results = [];
          for (u = 0, len1 = lines.length; u < len1; u++) {
            l = lines[u];
            results.push(this.drawVerticalGridLine(l[1]));
          }
          return results;
        }
      }

      // Draw a vertical grid line

      // @private
      drawVerticalGridLine(xpos) {
        var yEnd, yStart;
        xpos = Math.floor(this.transX(xpos)) + 0.5;
        yStart = this.yStart + this.options.verticalGridStartOffset;
        if (this.options.verticalGridHeight === 'full') {
          yEnd = this.yEnd;
        } else {
          yEnd = this.yStart - this.options.verticalGridHeight;
        }
        return this.drawGridLine(`M${xpos},${yStart}V${yEnd}`);
      }

      // draw the data series

      // @private
      drawSeries() {
        var i, k, ref2, ref3, results, u;
        this.seriesPoints = [];
        for (i = k = ref2 = this.options.ykeys.length - 1; (ref2 <= 0 ? k <= 0 : k >= 0); i = ref2 <= 0 ? ++k : --k) {
          if (this.hasToShow(i)) {
            if (this.options.trendLine !== false && this.options.trendLine === true || this.options.trendLine[i] === true) {
              this._drawTrendLine(i);
            }
            this._drawLineFor(i);
          }
        }
        results = [];
        for (i = u = ref3 = this.options.ykeys.length - 1; (ref3 <= 0 ? u <= 0 : u >= 0); i = ref3 <= 0 ? ++u : --u) {
          if (this.hasToShow(i)) {
            results.push(this._drawPointFor(i));
          } else {
            results.push(void 0);
          }
        }
        return results;
      }

      _drawPointFor(index) {
        var circle, k, len, ref2, results, row;
        this.seriesPoints[index] = [];
        ref2 = this.data;
        results = [];
        for (k = 0, len = ref2.length; k < len; k++) {
          row = ref2[k];
          circle = null;
          if (row._y[index] != null) {
            circle = this.drawLinePoint(row._x, row._y[index], this.colorFor(row, index, 'point'), index);
          }
          results.push(this.seriesPoints[index].push(circle));
        }
        return results;
      }

      _drawLineFor(index) {
        var path;
        path = this.paths[index];
        if (path !== null) {
          return this.drawLinePath(path, this.colorFor(null, index, 'line'), index);
        }
      }

      _drawTrendLine(index) {
        var a, b, data, datapoints, i, k, len, path, ref2, sum_x, sum_xx, sum_xy, sum_y, val, weight, x, y;
        // Least squares fitting for y = x * a + b
        sum_x = 0;
        sum_y = 0;
        sum_xx = 0;
        sum_xy = 0;
        datapoints = 0;
        ref2 = this.data;
        for (i = k = 0, len = ref2.length; k < len; i = ++k) {
          val = ref2[i];
          x = val.x;
          y = val.y[index];
          if (y === void 0) {
            continue;
          }
          if (this.options.trendLineWeight === false) {
            weight = 1;
          } else {
            weight = this.options.data[i][this.options.trendLineWeight];
          }
          datapoints += weight;
          sum_x += x * weight;
          sum_y += y * weight;
          sum_xx += x * x * weight;
          sum_xy += x * y * weight;
        }
        a = (datapoints * sum_xy - sum_x * sum_y) / (datapoints * sum_xx - sum_x * sum_x);
        b = (sum_y / datapoints) - ((a * sum_x) / datapoints);
        data = [{}, {}];
        data[0].x = this.transX(this.data[0].x);
        data[0].y = this.transY(this.data[0].x * a + b);
        data[1].x = this.transX(this.data[this.data.length - 1].x);
        data[1].y = this.transY(this.data[this.data.length - 1].x * a + b);
        path = Morris.Line.createPath(data, false, this.bottom);
        return path = this.raphael.path(path).attr('stroke', this.colorFor(null, index, 'trendLine')).attr('stroke-width', this.options.trendLineWidth);
      }

      // create a path for a data series

      // @private
      static createPath(coords, smooth, bottom) {
        var coord, g, grads, i, ix, k, len, lg, path, prevCoord, x1, x2, y1, y2;
        path = "";
        if (smooth) {
          grads = Morris.Line.gradients(coords);
        }
        prevCoord = {
          y: null
        };
        for (i = k = 0, len = coords.length; k < len; i = ++k) {
          coord = coords[i];
          if (coord.y != null) {
            if (prevCoord.y != null) {
              if (smooth) {
                g = grads[i];
                lg = grads[i - 1];
                ix = (coord.x - prevCoord.x) / 4;
                x1 = prevCoord.x + ix;
                y1 = Math.min(bottom, prevCoord.y + ix * lg);
                x2 = coord.x - ix;
                y2 = Math.min(bottom, coord.y - ix * g);
                path += `C${x1},${y1},${x2},${y2},${coord.x},${coord.y}`;
              } else {
                path += `L${coord.x},${coord.y}`;
              }
            } else {
              if (!smooth || (grads[i] != null)) {
                path += `M${coord.x},${coord.y}`;
              }
            }
          }
          prevCoord = coord;
        }
        return path;
      }

      // calculate a gradient at each point for a series of points

      // @private
      static gradients(coords) {
        var coord, grad, i, k, len, nextCoord, prevCoord, results;
        grad = function(a, b) {
          return (a.y - b.y) / (a.x - b.x);
        };
        results = [];
        for (i = k = 0, len = coords.length; k < len; i = ++k) {
          coord = coords[i];
          if (coord.y != null) {
            nextCoord = coords[i + 1] || {
              y: null
            };
            prevCoord = coords[i - 1] || {
              y: null
            };
            if ((prevCoord.y != null) && (nextCoord.y != null)) {
              results.push(grad(prevCoord, nextCoord));
            } else if (prevCoord.y != null) {
              results.push(grad(prevCoord, coord));
            } else if (nextCoord.y != null) {
              results.push(grad(coord, nextCoord));
            } else {
              results.push(null);
            }
          } else {
            results.push(null);
          }
        }
        return results;
      }

      hilight(index) {
        var i, k, ref2, ref3, u;
        boundMethodCheck(this, ref1);
        if (this.prevHilight !== null && this.prevHilight !== index) {
          for (i = k = 0, ref2 = this.seriesPoints.length - 1; (0 <= ref2 ? k <= ref2 : k >= ref2); i = 0 <= ref2 ? ++k : --k) {
            if (this.hasToShow(i) && this.seriesPoints[i][this.prevHilight]) {
              this.seriesPoints[i][this.prevHilight].animate(this.pointShrinkSeries(i));
            }
          }
        }
        if (index !== null && this.prevHilight !== index) {
          for (i = u = 0, ref3 = this.seriesPoints.length - 1; (0 <= ref3 ? u <= ref3 : u >= ref3); i = 0 <= ref3 ? ++u : --u) {
            if (this.hasToShow(i) && this.seriesPoints[i][index]) {
              this.seriesPoints[i][index].animate(this.pointGrowSeries(i));
            }
          }
        }
        return this.prevHilight = index;
      }

      colorFor(row, sidx, type) {
        if (typeof this.options.lineColors === 'function') {
          return this.options.lineColors.call(this, row, sidx, type);
        } else if (type === 'point') {
          return this.options.pointFillColors[sidx % this.options.pointFillColors.length] || this.options.lineColors[sidx % this.options.lineColors.length];
        } else if (type === 'trendLine') {
          return this.options.trendLineColors[sidx % this.options.trendLineColors.length];
        } else {
          return this.options.lineColors[sidx % this.options.lineColors.length];
        }
      }

      drawLinePath(path, lineColor, lineIndex) {
        return this.raphael.path(path).attr('stroke', lineColor).attr('stroke-width', this.lineWidthForSeries(lineIndex));
      }

      drawLinePoint(xPos, yPos, pointColor, lineIndex) {
        return this.raphael.circle(xPos, yPos, this.pointSizeForSeries(lineIndex)).attr('fill', pointColor).attr('stroke-width', this.pointStrokeWidthForSeries(lineIndex)).attr('stroke', this.pointStrokeColorForSeries(lineIndex));
      }

      // @private
      pointStrokeWidthForSeries(index) {
        return this.options.pointStrokeWidths[index % this.options.pointStrokeWidths.length];
      }

      // @private
      pointStrokeColorForSeries(index) {
        return this.options.pointStrokeColors[index % this.options.pointStrokeColors.length];
      }

      // @private
      lineWidthForSeries(index) {
        if (this.options.lineWidth instanceof Array) {
          return this.options.lineWidth[index % this.options.lineWidth.length];
        } else {
          return this.options.lineWidth;
        }
      }

      // @private
      pointSizeForSeries(index) {
        if (this.options.pointSize instanceof Array) {
          return this.options.pointSize[index % this.options.pointSize.length];
        } else {
          return this.options.pointSize;
        }
      }

      // @private
      pointGrowSeries(index) {
        if (this.pointSizeForSeries(index) === 0) {
          return;
        }
        return Raphael.animation({
          r: this.pointSizeForSeries(index) + 3
        }, 25, 'linear');
      }

      // @private
      pointShrinkSeries(index) {
        return Raphael.animation({
          r: this.pointSizeForSeries(index)
        }, 25, 'linear');
      }

    };

    // Default configuration

    Line.prototype.defaults = {
      lineWidth: 3,
      pointSize: 4,
      lineColors: ['#0b62a4', '#7A92A3', '#4da74d', '#afd8f8', '#edc240', '#cb4b4b', '#9440ed'],
      pointStrokeWidths: [1],
      pointStrokeColors: ['#ffffff'],
      pointFillColors: [],
      smooth: true,
      shown: true,
      xLabels: 'auto',
      xLabelFormat: null,
      xLabelMargin: 24,
      verticalGrid: false,
      verticalGridHeight: 'full',
      verticalGridStartOffset: 0,
      hideHover: false,
      trendLine: false,
      trendLineWidth: 2,
      trendLineWeight: false,
      trendLineColors: ['#689bc3', '#a2b3bf', '#64b764']
    };

    return Line;

  }).call(this);

  // generate a series of label, timestamp pairs for x-axis labels

  // @private
  Morris.labelSeries = function(dmin, dmax, pxwidth, specName, xLabelFormat) {
    var d, d0, ddensity, k, len, name, ref2, ret, s, spec, t;
    ddensity = 200 * (dmax - dmin) / pxwidth; // seconds per `margin` pixels
    d0 = new Date(dmin);
    spec = Morris.LABEL_SPECS[specName];
    // if the spec doesn't exist, search for the closest one in the list
    if (spec === void 0) {
      ref2 = Morris.AUTO_LABEL_ORDER;
      for (k = 0, len = ref2.length; k < len; k++) {
        name = ref2[k];
        s = Morris.LABEL_SPECS[name];
        if (ddensity >= s.span) {
          spec = s;
          break;
        }
      }
    }
    // if we run out of options, use second-intervals
    if (spec === void 0) {
      spec = Morris.LABEL_SPECS["second"];
    }
    // check if there's a user-defined formatting function
    if (xLabelFormat) {
      spec = $.extend({}, spec, {
        fmt: xLabelFormat
      });
    }
    // calculate labels
    d = spec.start(d0);
    ret = [];
    while ((t = d.getTime()) <= dmax) {
      if (t >= dmin) {
        ret.push([spec.fmt(d), t]);
      }
      spec.incr(d);
    }
    return ret;
  };

  // @private
  minutesSpecHelper = function(interval) {
    return {
      span: interval * 60 * 1000,
      start: function(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
      },
      fmt: function(d) {
        return `${Morris.pad2(d.getHours())}:${Morris.pad2(d.getMinutes())}`;
      },
      incr: function(d) {
        return d.setUTCMinutes(d.getUTCMinutes() + interval);
      }
    };
  };

  // @private
  secondsSpecHelper = function(interval) {
    return {
      span: interval * 1000,
      start: function(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
      },
      fmt: function(d) {
        return `${Morris.pad2(d.getHours())}:${Morris.pad2(d.getMinutes())}:${Morris.pad2(d.getSeconds())}`;
      },
      incr: function(d) {
        return d.setUTCSeconds(d.getUTCSeconds() + interval);
      }
    };
  };

  Morris.LABEL_SPECS = {
    "decade": {
      span: 172800000000, // 10 * 365 * 24 * 60 * 60 * 1000
      start: function(d) {
        return new Date(d.getFullYear() - d.getFullYear() % 10, 0, 1);
      },
      fmt: function(d) {
        return `${d.getFullYear()}`;
      },
      incr: function(d) {
        return d.setFullYear(d.getFullYear() + 10);
      }
    },
    "year": {
      span: 17280000000, // 365 * 24 * 60 * 60 * 1000
      start: function(d) {
        return new Date(d.getFullYear(), 0, 1);
      },
      fmt: function(d) {
        return `${d.getFullYear()}`;
      },
      incr: function(d) {
        return d.setFullYear(d.getFullYear() + 1);
      }
    },
    "month": {
      span: 2419200000, // 28 * 24 * 60 * 60 * 1000
      start: function(d) {
        return new Date(d.getFullYear(), d.getMonth(), 1);
      },
      fmt: function(d) {
        return `${d.getFullYear()}-${Morris.pad2(d.getMonth() + 1)}`;
      },
      incr: function(d) {
        return d.setMonth(d.getMonth() + 1);
      }
    },
    "week": {
      span: 604800000, // 7 * 24 * 60 * 60 * 1000
      start: function(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      },
      fmt: function(d) {
        return `${d.getFullYear()}-${Morris.pad2(d.getMonth() + 1)}-${Morris.pad2(d.getDate())}`;
      },
      incr: function(d) {
        return d.setDate(d.getDate() + 7);
      }
    },
    "day": {
      span: 86400000, // 24 * 60 * 60 * 1000
      start: function(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      },
      fmt: function(d) {
        return `${d.getFullYear()}-${Morris.pad2(d.getMonth() + 1)}-${Morris.pad2(d.getDate())}`;
      },
      incr: function(d) {
        return d.setDate(d.getDate() + 1);
      }
    },
    "hour": minutesSpecHelper(60),
    "30min": minutesSpecHelper(30),
    "15min": minutesSpecHelper(15),
    "10min": minutesSpecHelper(10),
    "5min": minutesSpecHelper(5),
    "minute": minutesSpecHelper(1),
    "30sec": secondsSpecHelper(30),
    "15sec": secondsSpecHelper(15),
    "10sec": secondsSpecHelper(10),
    "5sec": secondsSpecHelper(5),
    "second": secondsSpecHelper(1)
  };

  Morris.AUTO_LABEL_ORDER = ["decade", "year", "month", "week", "day", "hour", "30min", "15min", "10min", "5min", "minute", "30sec", "15sec", "10sec", "5sec", "second"];

  Morris.Area = (function() {
    var areaDefaults;

    class Area extends Morris.Line {
      constructor(options) {
        var areaOptions;
        // Start with a base options object
        areaOptions = $.extend({}, areaDefaults, options);
        // Modify areaOptions as needed BEFORE passing to super
        if (areaOptions.fillOpacity === 'auto') {
          areaOptions.fillOpacity = areaOptions.behaveLikeLine ? .8 : 1;
        }
        // Call super with the fully prepared options
        super(areaOptions);
        
        // Now assignments to '@' (this) are allowed
        this.cumulative = !areaOptions.behaveLikeLine;
      }

      // calculate series data point coordinates

      // @private
      calcPoints() {
        var k, len, ref2, results, row, total, y;
        ref2 = this.data;
        results = [];
        for (k = 0, len = ref2.length; k < len; k++) {
          row = ref2[k];
          row._x = this.transX(row.x);
          total = 0;
          row._y = (function() {
            var len1, ref3, results1, u;
            ref3 = row.y;
            results1 = [];
            for (u = 0, len1 = ref3.length; u < len1; u++) {
              y = ref3[u];
              if (this.options.behaveLikeLine) {
                results1.push(this.transY(y));
              } else {
                total += y || 0;
                results1.push(this.transY(total));
              }
            }
            return results1;
          }).call(this);
          results.push(row._ymax = Math.max(...row._y));
        }
        return results;
      }

      // draw the data series

      // @private
      drawSeries() {
        var i, k, len, range, ref2, ref3, results;
        this.seriesPoints = [];
        if (this.options.behaveLikeLine) {
          range = (function() {
            var results = [];
            for (var k = 0, ref2 = this.options.ykeys.length - 1; 0 <= ref2 ? k <= ref2 : k >= ref2; 0 <= ref2 ? k++ : k--){ results.push(k); }
            return results;
          }).apply(this);
        } else {
          range = (function() {
            var results = [];
            for (var k = ref3 = this.options.ykeys.length - 1; ref3 <= 0 ? k <= 0 : k >= 0; ref3 <= 0 ? k++ : k--){ results.push(k); }
            return results;
          }).apply(this);
        }
        results = [];
        for (k = 0, len = range.length; k < len; k++) {
          i = range[k];
          this._drawFillFor(i);
          this._drawLineFor(i);
          results.push(this._drawPointFor(i));
        }
        return results;
      }

      _drawFillFor(index) {
        var path;
        path = this.paths[index];
        if (path !== null) {
          path = path + `L${this.transX(this.xmax)},${this.bottom}L${this.transX(this.xmin)},${this.bottom}Z`;
          return this.drawFilledPath(path, this.fillForSeries(index));
        }
      }

      fillForSeries(i) {
        var color;
        color = Raphael.rgb2hsl(this.colorFor(this.data[i], i, 'line'));
        return Raphael.hsl(color.h, this.options.behaveLikeLine ? color.s * 0.9 : color.s * 0.75, Math.min(0.98, this.options.behaveLikeLine ? color.l * 1.2 : color.l * 1.25));
      }

      drawFilledPath(path, fill) {
        return this.raphael.path(path).attr('fill', fill).attr('fill-opacity', this.options.fillOpacity).attr('stroke', 'none');
      }

    };

    // Initialise

    areaDefaults = {
      fillOpacity: 'auto',
      behaveLikeLine: false
    };

    return Area;

  }).call(this);

  ref2 = Morris.Bar = (function() {
    class Bar extends Morris.Grid {
      constructor(options) {
        super($.extend({}, options, {
          parseTime: false
        }));
        // click on grid event handler

        // @private
        this.onGridClick = this.onGridClick.bind(this);
        // hover movement event handler

        // @private
        this.onHoverMove = this.onHoverMove.bind(this);
        // hover out event handler

        // @private
        this.onHoverOut = this.onHoverOut.bind(this);
      }

      init() {
        this.cumulative = this.options.stacked;
        if (this.options.hideHover !== 'always') {
          this.hover = new Morris.Hover({
            parent: this.el
          });
          this.on('hovermove', this.onHoverMove);
          this.on('hoverout', this.onHoverOut);
          return this.on('gridclick', this.onGridClick);
        }
      }

      // Do any size-related calculations

      // @private
      calc() {
        this.calcBars();
        if (this.options.hideHover === false) {
          return this.hover.update(...this.hoverContentForRow(this.data.length - 1));
        }
      }

      // calculate series data bars coordinates and sizes

      // @private
      calcBars() {
        var idx, k, len, ref3, results, row, y;
        ref3 = this.data;
        results = [];
        for (idx = k = 0, len = ref3.length; k < len; idx = ++k) {
          row = ref3[idx];
          row._x = this.xStart + this.xSize * (idx + 0.5) / this.data.length;
          results.push(row._y = (function() {
            var len1, ref4, results1, u;
            ref4 = row.y;
            results1 = [];
            for (u = 0, len1 = ref4.length; u < len1; u++) {
              y = ref4[u];
              if (y != null) {
                results1.push(this.transY(y));
              } else {
                results1.push(null);
              }
            }
            return results1;
          }).call(this));
        }
        return results;
      }

      // Draws the bar chart.

      draw() {
        var ref3;
        if ((ref3 = this.options.axes) === true || ref3 === 'both' || ref3 === 'x') {
          this.drawXAxis();
        }
        return this.drawSeries();
      }

      // draw the x-axis labels

      // @private
      drawXAxis() {
        var angle, basePos, i, k, label, labelBox, margin, maxSize, offset, prevAngleMargin, prevLabelMargin, ref3, results, row, size, startPos, textBox;
        // draw x axis labels
        if (!this.options.horizontal) {
          basePos = this.getXAxisLabelY();
        } else {
          basePos = this.getYAxisLabelX();
        }
        prevLabelMargin = null;
        prevAngleMargin = null;
        results = [];
        for (i = k = 0, ref3 = this.data.length; (0 <= ref3 ? k < ref3 : k > ref3); i = 0 <= ref3 ? ++k : --k) {
          row = this.data[this.data.length - 1 - i];
          if (!this.options.horizontal) {
            label = this.drawXAxisLabel(row._x, basePos, row.label);
          } else {
            label = this.drawYAxisLabel(basePos, row._x - 0.5 * this.options.gridTextSize, row.label);
          }
          if (!this.options.horizontal) {
            angle = this.options.xLabelAngle;
          } else {
            angle = 0;
          }
          textBox = label.getBBox();
          label.transform(`r${-angle}`);
          labelBox = label.getBBox();
          label.transform(`t0,${labelBox.height / 2}...`);
          if (angle !== 0) {
            offset = -0.5 * textBox.width * Math.cos(angle * Math.PI / 180.0);
            label.transform(`t${offset},0...`);
          }
          if (!this.options.horizontal) {
            startPos = labelBox.x;
            size = labelBox.width;
            maxSize = this.el.width();
          } else {
            startPos = labelBox.y;
            size = labelBox.height;
            maxSize = this.el.height();
          }
          // try to avoid overlaps
          if (((prevLabelMargin == null) || prevLabelMargin >= startPos + size || (prevAngleMargin != null) && prevAngleMargin >= startPos) && startPos >= 0 && (startPos + size) < maxSize) {
            if (angle !== 0) {
              margin = 1.25 * this.options.gridTextSize / Math.sin(angle * Math.PI / 180.0);
              prevAngleMargin = startPos - margin;
            }
            if (!this.options.horizontal) {
              results.push(prevLabelMargin = startPos - this.options.xLabelMargin);
            } else {
              results.push(prevLabelMargin = startPos);
            }
          } else {
            results.push(label.remove());
          }
        }
        return results;
      }

      // get the Y position of a label on the X axis

      // @private
      getXAxisLabelY() {
        return this.bottom + (this.options.xAxisLabelTopPadding || this.options.padding / 2);
      }

      // draw the data series

      // @private
      drawSeries() {
        var barMiddle, barWidth, bottom, groupWidth, i, idx, k, lastTop, left, leftPadding, numBars, ref3, row, sidx, size, spaceLeft, top, ypos, zeroPos;
        this.seriesBars = [];
        groupWidth = this.xSize / this.options.data.length;
        if (this.options.stacked) {
          numBars = 1;
        } else {
          numBars = 0;
          for (i = k = 0, ref3 = this.options.ykeys.length - 1; (0 <= ref3 ? k <= ref3 : k >= ref3); i = 0 <= ref3 ? ++k : --k) {
            if (this.hasToShow(i)) {
              numBars += 1;
            }
          }
        }
        barWidth = (groupWidth * this.options.barSizeRatio - this.options.barGap * (numBars - 1)) / numBars;
        if (this.options.barSize) {
          barWidth = Math.min(barWidth, this.options.barSize);
        }
        spaceLeft = groupWidth - barWidth * numBars - this.options.barGap * (numBars - 1);
        leftPadding = spaceLeft / 2;
        zeroPos = this.ymin <= 0 && this.ymax >= 0 ? this.transY(0) : null;
        this.bars = (function() {
          var len, ref4, results, u;
          ref4 = this.data;
          results = [];
          for (idx = u = 0, len = ref4.length; u < len; idx = ++u) {
            row = ref4[idx];
            this.seriesBars[idx] = [];
            lastTop = 0;
            results.push((function() {
              var len1, ref5, results1, v;
              ref5 = row._y;
              results1 = [];
              for (sidx = v = 0, len1 = ref5.length; v < len1; sidx = ++v) {
                ypos = ref5[sidx];
                if (!this.hasToShow(sidx)) {
                  continue;
                }
                if (ypos !== null) {
                  if (zeroPos) {
                    top = Math.min(ypos, zeroPos);
                    bottom = Math.max(ypos, zeroPos);
                  } else {
                    top = ypos;
                    bottom = this.bottom;
                  }
                  left = this.xStart + idx * groupWidth + leftPadding;
                  if (!this.options.stacked) {
                    left += sidx * (barWidth + this.options.barGap);
                  }
                  size = bottom - top;
                  if (this.options.verticalGridCondition && this.options.verticalGridCondition(row.x)) {
                    if (!this.options.horizontal) {
                      this.drawBar(this.xStart + idx * groupWidth, this.yEnd, groupWidth, this.ySize, this.options.verticalGridColor, this.options.verticalGridOpacity, this.options.barRadius);
                    } else {
                      this.drawBar(this.yStart, this.xStart + idx * groupWidth, this.ySize, groupWidth, this.options.verticalGridColor, this.options.verticalGridOpacity, this.options.barRadius);
                    }
                  }
                  if (this.options.stacked) {
                    top -= lastTop;
                  }
                  if (!this.options.horizontal) {
                    lastTop += size;
                    results1.push(this.seriesBars[idx][sidx] = this.drawBar(left, top, barWidth, size, this.colorFor(row, sidx, 'bar'), this.options.barOpacity, this.options.barRadius));
                  } else {
                    lastTop -= size;
                    this.seriesBars[idx][sidx] = this.drawBar(top, left, size, barWidth, this.colorFor(row, sidx, 'bar'), this.options.barOpacity, this.options.barRadius);
                    if (this.options.inBarValue && barWidth > this.options.gridTextSize + 2 * this.options.inBarValueMinTopMargin) {
                      barMiddle = left + 0.5 * barWidth;
                      results1.push(this.raphael.text(bottom - this.options.inBarValueRightMargin, barMiddle, this.yLabelFormat(row.y[sidx], sidx)).attr('font-size', this.options.gridTextSize).attr('font-family', this.options.gridTextFamily).attr('font-weight', this.options.gridTextWeight).attr('fill', this.options.inBarValueTextColor).attr('text-anchor', 'end'));
                    } else {
                      results1.push(void 0);
                    }
                  }
                } else {
                  results1.push(null);
                }
              }
              return results1;
            }).call(this));
          }
          return results;
        }).call(this);
        this.flat_bars = $.map(this.bars, function(n) {
          return n;
        });
        this.flat_bars = $.grep(this.flat_bars, function(n) {
          return n != null;
        });
        return this.bar_els = $($.map(this.flat_bars, function(n) {
          return n[0];
        }));
      }

      // hightlight the bar on hover

      // @private
      hilight(index) {
        var i, k, len, len1, ref3, ref4, u, y;
        if (this.seriesBars && this.seriesBars[this.prevHilight] && this.prevHilight !== null && this.prevHilight !== index) {
          ref3 = this.seriesBars[this.prevHilight];
          for (i = k = 0, len = ref3.length; k < len; i = ++k) {
            y = ref3[i];
            if (y) {
              y.animate({
                'fill-opacity': this.options.barOpacity
              }, this.options.highlightSpeed);
            }
          }
        }
        if (this.seriesBars && this.seriesBars[index] && index !== null && this.prevHilight !== index) {
          ref4 = this.seriesBars[index];
          for (i = u = 0, len1 = ref4.length; u < len1; i = ++u) {
            y = ref4[i];
            if (y) {
              y.animate({
                'fill-opacity': this.options.barHighlightOpacity
              }, this.options.highlightSpeed);
            }
          }
        }
        return this.prevHilight = index;
      }

      // @private

      // @param row  [Object] row data
      // @param sidx [Number] series index
      // @param type [String] "bar", "hover" or "label"
      colorFor(row, sidx, type) {
        var r, s;
        if (typeof this.options.barColors === 'function') {
          r = {
            x: row.x,
            y: row.y[sidx],
            label: row.label,
            src: row.src
          };
          s = {
            index: sidx,
            key: this.options.ykeys[sidx],
            label: this.options.labels[sidx]
          };
          return this.options.barColors.call(this, r, s, type);
        } else {
          return this.options.barColors[sidx % this.options.barColors.length];
        }
      }

      // hit test - returns the index of the row at the given x-coordinate

      hitTest(x, y) {
        var pos;
        if (this.data.length === 0) {
          return null;
        }
        if (!this.options.horizontal) {
          pos = x;
        } else {
          pos = y;
        }
        pos = Math.max(Math.min(pos, this.xEnd), this.xStart);
        return Math.min(this.data.length - 1, Math.floor((pos - this.xStart) / (this.xSize / this.data.length)));
      }

      onGridClick(x, y) {
        var bar_hit, index;
        boundMethodCheck(this, ref2);
        index = this.hitTest(x, y);
        bar_hit = !!this.bar_els.filter(function() {
          return $(this).is(':hover');
        }).length;
        return this.fire('click', index, this.data[index].src, x, y, bar_hit);
      }

      onHoverMove(x, y) {
        var index;
        boundMethodCheck(this, ref2);
        index = this.hitTest(x, y);
        this.hilight(index);
        if (index != null) {
          return this.hover.update(...this.hoverContentForRow(index));
        } else {
          return this.hover.hide();
        }
      }

      onHoverOut() {
        boundMethodCheck(this, ref2);
        this.hilight(-1);
        if (this.options.hideHover !== false) {
          return this.hover.hide();
        }
      }

      // hover content for a point

      // @private
      hoverContentForRow(index) {
        var content, j, k, len, ref3, row, x, y;
        row = this.data[index];
        content = $("<div class='morris-hover-row-label'>").text(row.label);
        content = content.prop('outerHTML');
        ref3 = row.y;
        for (j = k = 0, len = ref3.length; k < len; j = ++k) {
          y = ref3[j];
          if (this.options.labels[j] === false) {
            continue;
          }
          content += `<div class='morris-hover-point' style='color: ${this.colorFor(row, j, 'label')}'>
  ${this.options.labels[j]}:
  ${this.yLabelFormat(y, j)}
</div>`;
        }
        if (typeof this.options.hoverCallback === 'function') {
          content = this.options.hoverCallback(index, this.options, content, row.src);
        }
        if (!this.options.horizontal) {
          x = this.left + (index + 0.5) * this.width / this.data.length;
          return [content, x];
        } else {
          x = this.left + 0.5 * this.width;
          y = this.top + (index + 0.5) * this.height / this.data.length;
          return [content, x, y, true];
        }
      }

      drawBar(xPos, yPos, width, height, barColor, opacity, radiusArray) {
        var maxRadius, path;
        maxRadius = Math.max(...radiusArray);
        if (maxRadius === 0 || maxRadius > height) {
          path = this.raphael.rect(xPos, yPos, width, height);
        } else {
          path = this.raphael.path(this.roundedRect(xPos, yPos, width, height, radiusArray));
        }
        return path.attr('fill', barColor).attr('fill-opacity', opacity).attr('stroke', 'none');
      }

      roundedRect(x, y, w, h, r = [0, 0, 0, 0]) {
        return ["M", x, r[0] + y, "Q", x, y, x + r[0], y, "L", x + w - r[1], y, "Q", x + w, y, x + w, y + r[1], "L", x + w, y + h - r[2], "Q", x + w, y + h, x + w - r[2], y + h, "L", x + r[3], y + h, "Q", x, y + h, x, y + h - r[3], "Z"];
      }

    };

    // Default configuration

    Bar.prototype.defaults = {
      barSizeRatio: 0.75,
      barGap: 3,
      barColors: ['#0b62a4', '#7a92a3', '#4da74d', '#afd8f8', '#edc240', '#cb4b4b', '#9440ed'],
      barOpacity: 1.0,
      barHighlightOpacity: 1.0,
      highlightSpeed: 150,
      barRadius: [0, 0, 0, 0],
      xLabelMargin: 50,
      horizontal: false,
      shown: true,
      inBarValue: false,
      inBarValueTextColor: 'white',
      inBarValueMinTopMargin: 1,
      inBarValueRightMargin: 4
    };

    return Bar;

  }).call(this);

  // Donut charts.

  // @example
  //   Morris.Donut({
  //     el: $('#donut-container'),
  //     data: [
  //       { label: 'yin',  value: 50 },
  //       { label: 'yang', value: 50 }
  //     ]
  //   });
  ref3 = Morris.Donut = (function() {
    class Donut extends Morris.EventEmitter {
      // Create and render a donut chart.

      constructor(options) {
        super();
        // @private
        this.click = this.click.bind(this);
        // Select the segment at the given index.
        this.select = this.select.bind(this);
        this.resizeHandler = this.resizeHandler.bind(this);
        // The factory line "return new Morris.Donut(options) unless (@ instanceof Morris.Donut)" has been removed.
        this.options = $.extend({}, this.defaults, options);
        if (typeof options.element === 'string') {
          this.el = $(document.getElementById(options.element));
        } else {
          this.el = $(options.element);
        }
        if (this.el === null || this.el.length === 0) {
          throw new Error("Graph placeholder not found.");
        }
        // bail if there's no data
        if (options.data === void 0 || options.data.length === 0) {
          return;
        }
        this.raphael = new Raphael(this.el[0]);
        if (this.options.resize) {
          $(window).bind('resize', (evt) => {
            if (this.timeoutId != null) {
              window.clearTimeout(this.timeoutId);
            }
            return this.timeoutId = window.setTimeout(this.resizeHandler, 100);
          });
        }
        this.setData(options.data);
      }

      // Clear and redraw the chart.
      redraw() {
        var C, cx, cy, i, idx, k, last, len, len1, len2, max_value, min, next, ref4, ref5, ref6, results, seg, total, u, v, value, w;
        this.raphael.clear();
        cx = this.el.width() / 2;
        cy = this.el.height() / 2;
        w = (Math.min(cx, cy) - 10) / 3;
        total = 0;
        ref4 = this.values;
        for (k = 0, len = ref4.length; k < len; k++) {
          value = ref4[k];
          total += value;
        }
        min = 5 / (2 * w);
        C = 1.9999 * Math.PI - min * this.data.length;
        last = 0;
        idx = 0;
        this.segments = [];
        ref5 = this.values;
        for (i = u = 0, len1 = ref5.length; u < len1; i = ++u) {
          value = ref5[i];
          next = last + min + C * (value / total);
          seg = new Morris.DonutSegment(cx, cy, w * 2, w, last, next, this.data[i].color || this.options.colors[idx % this.options.colors.length], this.options.backgroundColor, idx, this.raphael);
          seg.render();
          this.segments.push(seg);
          seg.on('hover', this.select);
          seg.on('click', this.click);
          last = next;
          idx += 1;
        }
        this.text1 = this.drawEmptyDonutLabel(cx, cy - 10, this.options.labelColor, 15, 800);
        this.text2 = this.drawEmptyDonutLabel(cx, cy + 10, this.options.labelColor, 14);
        max_value = Math.max(...this.values);
        idx = 0;
        ref6 = this.values;
        results = [];
        for (v = 0, len2 = ref6.length; v < len2; v++) {
          value = ref6[v];
          if (value === max_value) {
            this.select(idx);
            break;
          }
          results.push(idx += 1);
        }
        return results;
      }

      setData(data) {
        var row;
        this.data = data;
        this.values = (function() {
          var k, len, ref4, results;
          ref4 = this.data;
          results = [];
          for (k = 0, len = ref4.length; k < len; k++) {
            row = ref4[k];
            results.push(parseFloat(row.value));
          }
          return results;
        }).call(this);
        return this.redraw();
      }

      click(idx) {
        boundMethodCheck(this, ref3);
        return this.fire('click', idx, this.data[idx]);
      }

      select(idx) {
        var k, len, ref4, row, s, segment;
        boundMethodCheck(this, ref3);
        ref4 = this.segments;
        for (k = 0, len = ref4.length; k < len; k++) {
          s = ref4[k];
          s.deselect();
        }
        segment = this.segments[idx];
        segment.select();
        row = this.data[idx];
        return this.setLabels(row.label, this.options.formatter(row.value, row));
      }

      // @private
      setLabels(label1, label2) {
        var inner, maxHeightBottom, maxHeightTop, maxWidth, text1bbox, text1scale, text2bbox, text2scale;
        inner = (Math.min(this.el.width() / 2, this.el.height() / 2) - 10) * 2 / 3;
        maxWidth = 1.8 * inner;
        maxHeightTop = inner / 2;
        maxHeightBottom = inner / 3;
        this.text1.attr({
          text: label1,
          transform: ''
        });
        text1bbox = this.text1.getBBox();
        text1scale = Math.min(maxWidth / text1bbox.width, maxHeightTop / text1bbox.height);
        this.text1.attr({
          transform: `S${text1scale},${text1scale},${text1bbox.x + text1bbox.width / 2},${text1bbox.y + text1bbox.height}`
        });
        this.text2.attr({
          text: label2,
          transform: ''
        });
        text2bbox = this.text2.getBBox();
        text2scale = Math.min(maxWidth / text2bbox.width, maxHeightBottom / text2bbox.height);
        return this.text2.attr({
          transform: `S${text2scale},${text2scale},${text2bbox.x + text2bbox.width / 2},${text2bbox.y}`
        });
      }

      drawEmptyDonutLabel(xPos, yPos, color, fontSize, fontWeight) {
        var text;
        text = this.raphael.text(xPos, yPos, '').attr('font-size', fontSize).attr('fill', color);
        if (fontWeight != null) {
          text.attr('font-weight', fontWeight);
        }
        return text;
      }

      resizeHandler() {
        boundMethodCheck(this, ref3);
        this.timeoutId = null;
        this.raphael.setSize(this.el.width(), this.el.height());
        return this.redraw();
      }

    };

    Donut.prototype.defaults = {
      colors: ['#0B62A4', '#3980B5', '#679DC6', '#95BBD7', '#B0CCE1', '#095791', '#095085', '#083E67', '#052C48', '#042135'],
      backgroundColor: '#FFFFFF',
      labelColor: '#000000',
      formatter: Morris.commas,
      resize: false
    };

    return Donut;

  }).call(this);

  // A segment within a donut chart.

  // @private
  ref4 = Morris.DonutSegment = class DonutSegment extends Morris.EventEmitter {
    constructor(cx, cy, inner, outer, p0, p1, color, backgroundColor, index, raphael) {
      super();
      this.select = this.select.bind(this);
      this.deselect = this.deselect.bind(this);
      
      // Manually assign parameters to instance variables
      this.cx = cx;
      this.cy = cy;
      this.inner = inner;
      this.outer = outer;
      // p0 and p1 are used directly, not typically assigned as @p0, @p1 unless needed elsewhere
      this.color = color;
      this.backgroundColor = backgroundColor;
      this.index = index;
      this.raphael = raphael;
      // Original logic using p0, p1 and the now-assigned instance variables
      this.sin_p0 = Math.sin(p0);
      this.cos_p0 = Math.cos(p0);
      this.sin_p1 = Math.sin(p1);
      this.cos_p1 = Math.cos(p1);
      this.is_long = (p1 - p0) > Math.PI ? 1 : 0;
      this.path = this.calcSegment(this.inner + 3, this.inner + this.outer - 5);
      this.selectedPath = this.calcSegment(this.inner + 3, this.inner + this.outer);
      this.hilight = this.calcArc(this.inner);
    }

    calcArcPoints(r) {
      return [this.cx + r * this.sin_p0, this.cy + r * this.cos_p0, this.cx + r * this.sin_p1, this.cy + r * this.cos_p1];
    }

    calcSegment(r1, r2) {
      var ix0, ix1, iy0, iy1, ox0, ox1, oy0, oy1;
      [ix0, iy0, ix1, iy1] = this.calcArcPoints(r1);
      [ox0, oy0, ox1, oy1] = this.calcArcPoints(r2);
      return `M${ix0},${iy0}` + `A${r1},${r1},0,${this.is_long},0,${ix1},${iy1}` + `L${ox1},${oy1}` + `A${r2},${r2},0,${this.is_long},1,${ox0},${oy0}` + "Z";
    }

    calcArc(r) {
      var ix0, ix1, iy0, iy1;
      [ix0, iy0, ix1, iy1] = this.calcArcPoints(r);
      return `M${ix0},${iy0}` + `A${r},${r},0,${this.is_long},0,${ix1},${iy1}`;
    }

    render() {
      this.arc = this.drawDonutArc(this.hilight, this.color);
      return this.seg = this.drawDonutSegment(this.path, this.color, this.backgroundColor, () => {
        return this.fire('hover', this.index);
      }, () => {
        return this.fire('click', this.index);
      });
    }

    drawDonutArc(path, color) {
      return this.raphael.path(path).attr({
        stroke: color,
        'stroke-width': 2,
        opacity: 0
      });
    }

    drawDonutSegment(path, fillColor, strokeColor, hoverFunction, clickFunction) {
      return this.raphael.path(path).attr({
        fill: fillColor,
        stroke: strokeColor,
        'stroke-width': 3
      }).hover(hoverFunction).click(clickFunction);
    }

    select() {
      boundMethodCheck(this, ref4);
      if (!this.selected) {
        this.seg.animate({
          path: this.selectedPath
        }, 150, '<>');
        this.arc.animate({
          opacity: 1
        }, 150, '<>');
        return this.selected = true;
      }
    }

    deselect() {
      boundMethodCheck(this, ref4);
      if (this.selected) {
        this.seg.animate({
          path: this.path
        }, 150, '<>');
        this.arc.animate({
          opacity: 0
        }, 150, '<>');
        return this.selected = false;
      }
    }

  };

}).call(this);

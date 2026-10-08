(function(window) {
    'use strict';

    const CONFIG = {
        SNAP_TOLERANCE_METERS: 100,   // 标点吸附到道路的最大距离
        GROUP_TOLERANCE_METERS: 8,    // 道路端点/交点合并为同一图节点的最大距离
        CELL_SIZE_DEG: 0.005,
        MIN_LNG: 120.51,
        MAX_LNG: 122.25,
        MIN_LAT: 30.40,
        MAX_LAT: 31.95
    };

    // ---- 半正矢距离（米） ----
    function haversineDist(a, b) {
        const R = 6371000;
        const toRad = Math.PI / 180;
        const dLat = (b[1] - a[1]) * toRad;
        const dLng = (b[0] - a[0]) * toRad;
        const sinDLat = Math.sin(dLat / 2);
        const sinDLng = Math.sin(dLng / 2);
        const lat1 = a[1] * toRad;
        const lat2 = b[1] * toRad;
        const aVal = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
        return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    }

    // ---- 坐标取整（用于 Map key） ----
    function roundKey(coord) {
        return coord[0].toFixed(6) + ',' + coord[1].toFixed(6);
    }

    // ---- 点到线段最近点 ----
    function closestPointOnSegment(p, a, b) {
        var dx = b[0] - a[0];
        var dy = b[1] - a[1];
        var lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return { point: [a[0], a[1]], t: 0 };
        var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return {
            point: [a[0] + t * dx, a[1] + t * dy],
            t: t
        };
    }

    // ---- 线段交叉检测 ----
    function segmentsIntersect(s1, s2) {
        var ax = s1.a[0], ay = s1.a[1];
        var bx = s1.b[0], by = s1.b[1];
        var cx = s2.a[0], cy = s2.a[1];
        var dx = s2.b[0], dy = s2.b[1];

        var rx = bx - ax, ry = by - ay;
        var sx = dx - cx, sy = dy - cy;
        var rxs = rx * sy - ry * sx;
        if (Math.abs(rxs) < 1e-15) return null;

        var t = ((cx - ax) * sy - (cy - ay) * sx) / rxs;
        var u = ((cx - ax) * ry - (cy - ay) * rx) / rxs;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return { point: [ax + t * rx, ay + t * ry], t: t, u: u };
        }
        return null;
    }

    // ---- 并查集 ----
    function UnionFind(n) {
        this.parent = new Array(n);
        this.rank = new Array(n);
        for (var i = 0; i < n; i++) {
            this.parent[i] = i;
            this.rank[i] = 0;
        }
    }
    UnionFind.prototype.find = function(x) {
        if (this.parent[x] !== x) {
            this.parent[x] = this.find(this.parent[x]);
        }
        return this.parent[x];
    };
    UnionFind.prototype.union = function(x, y) {
        var rx = this.find(x);
        var ry = this.find(y);
        if (rx === ry) return;
        if (this.rank[rx] < this.rank[ry]) {
            this.parent[rx] = ry;
        } else if (this.rank[rx] > this.rank[ry]) {
            this.parent[ry] = rx;
        } else {
            this.parent[ry] = rx;
            this.rank[rx]++;
        }
    };

    // ---- 最小堆 ----
    function MinHeap() {
        this.heap = [];
    }
    MinHeap.prototype.insert = function(nodeId, priority) {
        this.heap.push({ id: nodeId, p: priority });
        this._bubbleUp(this.heap.length - 1);
    };
    MinHeap.prototype.extractMin = function() {
        if (this.heap.length === 0) return null;
        var min = this.heap[0];
        var last = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this._bubbleDown(0);
        }
        return [min.id, min.p];
    };
    MinHeap.prototype.isEmpty = function() {
        return this.heap.length === 0;
    };
    MinHeap.prototype._bubbleUp = function(i) {
        var heap = this.heap;
        while (i > 0) {
            var parent = (i - 1) >> 1;
            if (heap[i].p >= heap[parent].p) break;
            var tmp = heap[i];
            heap[i] = heap[parent];
            heap[parent] = tmp;
            i = parent;
        }
    };
    MinHeap.prototype._bubbleDown = function(i) {
        var heap = this.heap;
        var n = heap.length;
        while (true) {
            var smallest = i;
            var left = (i << 1) + 1;
            var right = left + 1;
            if (left < n && heap[left].p < heap[smallest].p) smallest = left;
            if (right < n && heap[right].p < heap[smallest].p) smallest = right;
            if (smallest === i) break;
            var tmp = heap[i];
            heap[i] = heap[smallest];
            heap[smallest] = tmp;
            i = smallest;
        }
    };

    // ---- 路段展平 ----
    function flattenData(geojson) {
        var segments = [];
        var roads = [];
        var segRoadMap = [];
        var roadSegKeyToSegId = {};  // "roadIdx_segIdx" -> segId 快速查找
        var segId = 0;

        var features = geojson.features;
        for (var fi = 0; fi < features.length; fi++) {
            var coords = features[fi].geometry.coordinates;
            for (var li = 0; li < coords.length; li++) {
                var lineString = coords[li];
                if (lineString.length < 2) continue;
                var roadIdx = roads.length;
                roads.push({ coords: lineString, street: features[fi].properties.street || '' });
                for (var i = 0; i < lineString.length - 1; i++) {
                    segments.push({ id: segId, a: lineString[i], b: lineString[i + 1] });
                    segRoadMap[segId] = { roadIdx: roadIdx, segIdx: i };
                    roadSegKeyToSegId[roadIdx + '_' + i] = segId;
                    segId++;
                }
            }
        }
        // 连接所有邻近道路端点（不限路名），解决碎片化和三角形路口不连接问题
        var FRAGMENT_MERGE_TOLERANCE_METERS = 50;
        var endpointData = [];
        for (var ri = 0; ri < roads.length; ri++) {
            var c = roads[ri].coords;
            endpointData.push({ roadIdx: ri, epIdx: 0, coord: [c[0][0], c[0][1]] });
            endpointData.push({ roadIdx: ri, epIdx: c.length - 1, coord: [c[c.length - 1][0], c[c.length - 1][1]] });
        }

        var epParent = [];
        var epRank = [];
        for (var ei = 0; ei < endpointData.length; ei++) {
            epParent.push(ei);
            epRank.push(0);
        }

        function epFind(x) {
            while (epParent[x] !== x) {
                epParent[x] = epParent[epParent[x]];
                x = epParent[x];
            }
            return x;
        }

        function epUnion(a, b) {
            var ra = epFind(a), rb = epFind(b);
            if (ra === rb) return;
            if (epRank[ra] < epRank[rb]) { epParent[ra] = rb; }
            else if (epRank[ra] > epRank[rb]) { epParent[rb] = ra; }
            else { epParent[rb] = ra; epRank[ra]++; }
        }

        for (var ei = 0; ei < endpointData.length; ei++) {
            for (var ej = ei + 1; ej < endpointData.length; ej++) {
                if (endpointData[ei].roadIdx === endpointData[ej].roadIdx) continue;
                var d = haversineDist(endpointData[ei].coord, endpointData[ej].coord);
                if (d < FRAGMENT_MERGE_TOLERANCE_METERS) {
                    epUnion(ei, ej);
                }
            }
        }

        var groups = {};
        for (var ei = 0; ei < endpointData.length; ei++) {
            var root = epFind(ei);
            if (!groups[root]) groups[root] = [];
            groups[root].push(ei);
        }

        for (var root in groups) {
            var members = groups[root];
            var sumLng = 0, sumLat = 0;
            for (var mi = 0; mi < members.length; mi++) {
                sumLng += endpointData[members[mi]].coord[0];
                sumLat += endpointData[members[mi]].coord[1];
            }
            var centroid = [sumLng / members.length, sumLat / members.length];
            for (var mi = 0; mi < members.length; mi++) {
                var ep = endpointData[members[mi]];
                roads[ep.roadIdx].coords[ep.epIdx][0] = centroid[0];
                roads[ep.roadIdx].coords[ep.epIdx][1] = centroid[1];
            }
        }

        return { segments: segments, roads: roads, segRoadMap: segRoadMap, roadSegKeyToSegId: roadSegKeyToSegId };
    }

    // ---- 空间索引（网格法） ----
    function buildSegmentGrid(segments) {
        var grid = new Map();
        var minLng = CONFIG.MIN_LNG, maxLng = CONFIG.MAX_LNG;
        var minLat = CONFIG.MIN_LAT, maxLat = CONFIG.MAX_LAT;
        var cellSize = CONFIG.CELL_SIZE_DEG;

        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var minSLng = Math.min(seg.a[0], seg.b[0]);
            var maxSLng = Math.max(seg.a[0], seg.b[0]);
            var minSLat = Math.min(seg.a[1], seg.b[1]);
            var maxSLat = Math.max(seg.a[1], seg.b[1]);

            var colStart = Math.max(0, Math.floor((minSLng - minLng) / cellSize));
            var colEnd = Math.floor((maxSLng - minLng) / cellSize);
            var rowStart = Math.max(0, Math.floor((minSLat - minLat) / cellSize));
            var rowEnd = Math.floor((maxSLat - minLat) / cellSize);

            for (var r = rowStart; r <= rowEnd; r++) {
                for (var c = colStart; c <= colEnd; c++) {
                    var key = r + ',' + c;
                    if (!grid.has(key)) grid.set(key, []);
                    grid.get(key).push(seg.id);
                }
            }
        }
        return { grid: grid, minLng: minLng, minLat: minLat, cellSize: cellSize };
    }

    // ---- 图构建 ----
    function buildGraph(geojson) {
        if (!geojson || !geojson.features) return null;

        var flat = flattenData(geojson);
        var segments = flat.segments;
        var roads = flat.roads;
        var segRoadMap = flat.segRoadMap;
        var roadSegKeyToSegId = flat.roadSegKeyToSegId;

        // 空间索引
        var segSpatial = buildSegmentGrid(segments);
        var segGrid = segSpatial.grid;

        // 查找所有线段交点
        var segIntersections = new Map();
        var checkedPairs = new Set();
        var allIntersections = [];
        var intersectionIdCounter = 0;

        var cellKeys = Array.from(segGrid.keys());
        for (var ci = 0; ci < cellKeys.length; ci++) {
            var segIds = segGrid.get(cellKeys[ci]);
            if (segIds.length < 2) continue;
            for (var i = 0; i < segIds.length; i++) {
                for (var j = i + 1; j < segIds.length; j++) {
                    var idA = segIds[i], idB = segIds[j];
                    var pairKey = Math.min(idA, idB) + '_' + Math.max(idA, idB);
                    if (checkedPairs.has(pairKey)) continue;
                    checkedPairs.add(pairKey);

                    var result = segmentsIntersect(segments[idA], segments[idB]);
                    if (result) {
                        result.id = intersectionIdCounter++;
                        result.segA = idA;
                        result.segB = idB;
                        allIntersections.push(result);

                        if (!segIntersections.has(idA)) segIntersections.set(idA, []);
                        segIntersections.get(idA).push({ point: result.point, t: result.t, id: result.id });

                        if (!segIntersections.has(idB)) segIntersections.set(idB, []);
                        segIntersections.get(idB).push({ point: result.point, t: result.u, id: result.id });
                    }
                }
            }
        }

        // 收集所有锚点
        var anchorPoints = [];

        // 添加路段端点
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            // 每个端点只添加一次（用 rounded key 去重）
            var keyA = roundKey(seg.a);
            var keyB = roundKey(seg.b);
            anchorPoints.push({ coord: seg.a, key: keyA, isEndpoint: true });
            anchorPoints.push({ coord: seg.b, key: keyB, isEndpoint: true });
        }

        // 添加交点
        for (var i = 0; i < allIntersections.length; i++) {
            var pt = allIntersections[i].point;
            var key = roundKey(pt);
            anchorPoints.push({ coord: pt, key: key, isEndpoint: false, intId: allIntersections[i].id });
        }

        // 用网格法做邻近分组
        var groupCellSize = CONFIG.GROUP_TOLERANCE_METERS / 111320 * 2;
        var pointGrid = new Map();
        for (var i = 0; i < anchorPoints.length; i++) {
            var pt = anchorPoints[i];
            var col = Math.floor((pt.coord[0] - CONFIG.MIN_LNG) / groupCellSize);
            var row = Math.floor((pt.coord[1] - CONFIG.MIN_LAT) / groupCellSize);
            var key = row + ',' + col;
            if (!pointGrid.has(key)) pointGrid.set(key, []);
            pointGrid.get(key).push(i);
        }

        // 并查集合并邻近锚点
        var uf = new UnionFind(anchorPoints.length);
        var pointKeys = Array.from(pointGrid.keys());
        for (var pi = 0; pi < pointKeys.length; pi++) {
            var indices = pointGrid.get(pointKeys[pi]);
            if (indices.length < 2) continue;
            for (var i = 0; i < indices.length; i++) {
                for (var j = i + 1; j < indices.length; j++) {
                    var a = indices[i], b = indices[j];
                    var dist = haversineDist(anchorPoints[a].coord, anchorPoints[b].coord);
                    if (dist < CONFIG.GROUP_TOLERANCE_METERS) {
                        uf.union(a, b);
                    }
                }
            }
        }

        // 构建节点组
        var rootToGroup = new Map();
        for (var i = 0; i < anchorPoints.length; i++) {
            var root = uf.find(i);
            if (!rootToGroup.has(root)) {
                rootToGroup.set(root, { indices: [], sumLng: 0, sumLat: 0 });
            }
            var grp = rootToGroup.get(root);
            grp.indices.push(i);
            grp.sumLng += anchorPoints[i].coord[0];
            grp.sumLat += anchorPoints[i].coord[1];
        }

        // 创建图节点
        var nodes = new Map();
        var nodeIdCounter = 0;
        var rootKeys = Array.from(rootToGroup.keys());
        for (var ri = 0; ri < rootKeys.length; ri++) {
            var grp = rootToGroup.get(rootKeys[ri]);
            var nodeId = nodeIdCounter++;
            var centroid = [grp.sumLng / grp.indices.length, grp.sumLat / grp.indices.length];
            nodes.set(nodeId, { id: nodeId, coord: centroid });
        }

        // 构建坐标到节点的映射
        var coordToNode = new Map();
        var rootKeys2 = Array.from(rootToGroup.keys());
        for (var ri2 = 0; ri2 < rootKeys2.length; ri2++) {
            var grp = rootToGroup.get(rootKeys2[ri2]);
            var nodeId = ri2;  // 节点按顺序创建，nodeId 等于索引
            for (var gi = 0; gi < grp.indices.length; gi++) {
                var idx = grp.indices[gi];
                var key = anchorPoints[idx].key;
                if (!coordToNode.has(key)) {
                    coordToNode.set(key, nodeId);
                }
            }
        }

        // 构建邻接表
        var adjacency = new Map();
        var nodeIdKeys = Array.from(nodes.keys());
        for (var ni = 0; ni < nodeIdKeys.length; ni++) {
            adjacency.set(nodeIdKeys[ni], []);
        }

        function addEdge(fromId, toId, weight) {
            var neighbors = adjacency.get(fromId);
            for (var k = 0; k < neighbors.length; k++) {
                if (neighbors[k].to === toId) {
                    if (weight < neighbors[k].weight) neighbors[k].weight = weight;
                    return;
                }
            }
            neighbors.push({ to: toId, weight: weight });
        }

        // 沿每条道路折线添加边
        for (var ri = 0; ri < roads.length; ri++) {
            var road = roads[ri];
            var coords = road.coords;
            if (coords.length < 2) continue;

            // 收集这条路上的所有锚点
            var roadAnchors = [];

            // 原始顶点
            for (var vi = 0; vi < coords.length; vi++) {
                var key = roundKey(coords[vi]);
                var nodeId = coordToNode.get(key);
                if (nodeId !== undefined) {
                    roadAnchors.push({ nodeId: nodeId, coord: coords[vi], pos: vi });
                }
            }

            // 这条路上的交点（使用索引快速查找）
            for (var si = 0; si < coords.length - 1; si++) {
                var segId = roadSegKeyToSegId[ri + '_' + si];
                if (segId === undefined) continue;
                var ints = segIntersections.get(segId);
                if (ints) {
                    for (var ii = 0; ii < ints.length; ii++) {
                        var intPt = ints[ii];
                        var key = roundKey(intPt.point);
                        var nodeId = coordToNode.get(key);
                        if (nodeId !== undefined) {
                            roadAnchors.push({ nodeId: nodeId, coord: intPt.point, pos: si + intPt.t });
                        }
                    }
                }
            }

            // 按沿路位置排序
            roadAnchors.sort(function(a, b) { return a.pos - b.pos; });

            // 连续不同节点间添加边
            for (var ai = 0; ai < roadAnchors.length - 1; ai++) {
                var curr = roadAnchors[ai];
                var next = roadAnchors[ai + 1];
                if (curr.nodeId !== next.nodeId) {
                    var w = haversineDist(curr.coord, next.coord);
                    addEdge(curr.nodeId, next.nodeId, w);
                    addEdge(next.nodeId, curr.nodeId, w);
                }
            }
        }

        // 构建节点空间索引（用于快速吸附）
        var nodeGrid = new Map();
        var nodeCellSize = CONFIG.CELL_SIZE_DEG;
        var nodeIdArr = Array.from(nodes.keys());
        for (var ni2 = 0; ni2 < nodeIdArr.length; ni2++) {
            var nid = nodeIdArr[ni2];
            var nd = nodes.get(nid);
            var col = Math.floor((nd.coord[0] - CONFIG.MIN_LNG) / nodeCellSize);
            var row = Math.floor((nd.coord[1] - CONFIG.MIN_LAT) / nodeCellSize);
            var key = row + ',' + col;
            if (!nodeGrid.has(key)) nodeGrid.set(key, []);
            nodeGrid.get(key).push({ id: nid, coord: nd.coord });
        }

        var graph = {
            nodes: nodes,
            adjacency: adjacency,
            segmentGrid: segSpatial,
            nodeGrid: nodeGrid,
            nodeCellSize: nodeCellSize,
            segments: segments,
            coordToNode: coordToNode
        };

        return graph;
    }

    // ---- 坐标吸附到图节点 ----
    function snapToGraph(graph, coord, toleranceMeters) {
        var col = Math.floor((coord[0] - CONFIG.MIN_LNG) / graph.nodeCellSize);
        var row = Math.floor((coord[1] - CONFIG.MIN_LAT) / graph.nodeCellSize);

        var nearestId = null;
        var nearestDist = Infinity;

        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                var key = (row + dr) + ',' + (col + dc);
                var candidates = graph.nodeGrid.get(key);
                if (!candidates) continue;
                for (var i = 0; i < candidates.length; i++) {
                    var dist = haversineDist(coord, candidates[i].coord);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestId = candidates[i].id;
                    }
                }
            }
        }

        if (nearestDist > toleranceMeters) return null;
        return nearestId;
    }

    // ---- 查找坐标在道路网上的最近点 ----
    function findClosestPointOnRoad(graph, coord) {
        var col = Math.floor((coord[0] - CONFIG.MIN_LNG) / graph.segmentGrid.cellSize);
        var row = Math.floor((coord[1] - CONFIG.MIN_LAT) / graph.segmentGrid.cellSize);

        var bestDist = Infinity;
        var bestPoint = null;
        var bestSegId = -1;

        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                var key = (row + dr) + ',' + (col + dc);
                var segIds = graph.segmentGrid.grid.get(key);
                if (!segIds) continue;
                for (var i = 0; i < segIds.length; i++) {
                    var sid = segIds[i];
                    var seg = graph.segments[sid];
                    var result = closestPointOnSegment(coord, seg.a, seg.b);
                    var dist = haversineDist(coord, result.point);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPoint = result.point;
                        bestSegId = sid;
                    }
                }
            }
        }
        if (bestPoint === null) return null;
        return { point: bestPoint, dist: bestDist, segId: bestSegId };
    }

    // ---- 获取路段两端对应的图节点 ----
    function getSegmentNodes(graph, segId) {
        var seg = graph.segments[segId];
        var nodes = [];
        var keyA = roundKey(seg.a);
        var keyB = roundKey(seg.b);
        var nA = graph.coordToNode.get(keyA);
        var nB = graph.coordToNode.get(keyB);
        if (nA !== undefined) nodes.push(nA);
        if (nB !== undefined && nB !== nA) nodes.push(nB);
        return nodes;
    }

    // ---- 多目标 Dijkstra（遇到任一 endNode 即停） ----
    function dijkstraMultiTarget(graph, startNode, endNodeSet) {
        var dist = new Map();
        var prev = new Map();
        var pq = new MinHeap();

        dist.set(startNode, 0);
        pq.insert(startNode, 0);
        var foundEnd = null;

        while (!pq.isEmpty()) {
            var extracted = pq.extractMin();
            var u = extracted[0];
            var d = extracted[1];

            if (d > (dist.get(u) || Infinity)) continue;
            if (endNodeSet.has(u)) { foundEnd = u; break; }

            var neighbors = graph.adjacency.get(u);
            if (!neighbors) continue;
            for (var i = 0; i < neighbors.length; i++) {
                var v = neighbors[i].to;
                var w = neighbors[i].weight;
                var alt = d + w;
                if (alt < (dist.get(v) || Infinity)) {
                    dist.set(v, alt);
                    prev.set(v, u);
                    pq.insert(v, alt);
                }
            }
        }

        if (foundEnd === null) return null;

        var path = [];
        var cur = foundEnd;
        var maxIter = graph.nodes.size + 10;
        while (cur !== undefined && maxIter-- > 0) {
            var node = graph.nodes.get(cur);
            if (!node) break;
            path.push(node.coord);
            cur = prev.get(cur);
        }
        path.reverse();
        return path;
    }

    // ---- 最短路径（道路线段投影版本） ----
    function findShortestPath(graph, startCoord, endCoord, toleranceMeters) {
        if (!graph || !graph.nodes || graph.nodes.size === 0) return null;
        toleranceMeters = toleranceMeters || CONFIG.SNAP_TOLERANCE_METERS;

        var startPt = findClosestPointOnRoad(graph, startCoord);
        var endPt = findClosestPointOnRoad(graph, endCoord);

        if (!startPt || !endPt) return null;
        if (startPt.dist > toleranceMeters || endPt.dist > toleranceMeters) return null;

        var startNodes = getSegmentNodes(graph, startPt.segId);
        var endNodes = getSegmentNodes(graph, endPt.segId);

        if (startNodes.length === 0 || endNodes.length === 0) return null;

        var endNodeSet = new Set(endNodes);

        if (startPt.segId === endPt.segId) {
            return [startCoord, startPt.point, endPt.point, endCoord];
        }

        var bestPath = null;
        var bestDist = Infinity;

        for (var si = 0; si < startNodes.length; si++) {
            var roadPath = dijkstraMultiTarget(graph, startNodes[si], endNodeSet);
            if (roadPath && roadPath.length > 0) {
                var d = computePathLength(roadPath);
                if (d < bestDist) {
                    bestDist = d;
                    bestPath = roadPath;
                }
            }
        }

        if (!bestPath) return null;

        var fullPath = [startCoord, startPt.point];
        for (var i = 0; i < bestPath.length; i++) {
            fullPath.push(bestPath[i]);
        }
        fullPath.push(endPt.point);
        fullPath.push(endCoord);

        return fullPath;
    }

    // ---- 计算路径总长度（米） ----
    function computePathLength(coords) {
        var total = 0;
        for (var i = 0; i < coords.length - 1; i++) {
            total += haversineDist(coords[i], coords[i + 1]);
        }
        return total;
    }

    // ---- 公开 API ----
    window.RoadGraphBuilder = {
        buildGraph: buildGraph,
        findShortestPath: findShortestPath,
        findClosestPointOnRoad: findClosestPointOnRoad,
        snapToGraph: snapToGraph,
        computePathLength: computePathLength,
        haversineDist: haversineDist
    };

})(window);

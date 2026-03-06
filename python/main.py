import io, json, base64
import re
import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import FancyArrowPatch

DF = None

_intlike_re = re.compile(r"^\s*(-?\d+)\.0\s*$")

def canon_id(v):
    """Make id/pid comparable even if CSV mixes 1 vs 1.0 vs ' 1 '."""
    if v is None or pd.isna(v):
        return None
    if isinstance(v, str):
        s = v.strip()
        m = _intlike_re.match(s)
        if m:
            return m.group(1)
        return s if s != "" else None
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    if isinstance(v, (float, np.floating)):
        if float(v).is_integer():
            return str(int(v))
        return str(float(v))
    return str(v).strip()

def load_csv_from_text(text: str, preview_n: int = 10):
    global DF
    DF = pd.read_csv(io.StringIO(text))
    cols = DF.columns.tolist()
    preview = DF.head(preview_n).to_dict(orient="records")
    return {"columns": cols, "preview": preview, "total_rows": int(len(DF)), "preview_is_full": len(DF) <= preview_n}

def compute_tree_layout(df, id_col="id", parent_col="pid", depth_col=None):
    df = df.copy()
    df[id_col] = df[id_col].map(canon_id)
    df[parent_col] = df[parent_col].map(canon_id)

    if df[id_col].isna().any():
        raise ValueError("Some id values are missing after normalization.")
    if df[id_col].duplicated().any():
        dup = df.loc[df[id_col].duplicated(), id_col].iloc[0]
        raise ValueError(f"Duplicate id detected: {dup}")

    ids = set(df[id_col])

    # children adjacency
    children = {}
    for _, r in df.iterrows():
        nid = r[id_col]
        pid = r[parent_col]
        if pid is None or pid not in ids:
            continue
        children.setdefault(pid, []).append(nid)

    for p in children:
        children[p].sort()

    # roots
    roots = []
    for _, r in df.iterrows():
        pid = r[parent_col]
        if pid is None or pid not in ids:
            roots.append(r[id_col])
    seen = set()
    roots = [r for r in roots if not (r in seen or seen.add(r))]

    # x: leaf-centered
    x = {}
    leaf_counter = 0

    def dfs(n):
        nonlocal leaf_counter
        kids = children.get(n, [])
        if not kids:
            x[n] = float(leaf_counter)
            leaf_counter += 1
            return x[n]
        xs = [dfs(k) for k in kids]
        x[n] = float(np.mean(xs))
        return x[n]

    offset = 0
    for r in roots:
        leaf_counter = offset
        dfs(r)
        offset = leaf_counter + 1

    # y
    if depth_col is not None and depth_col in df.columns and depth_col != "":
        y = dict(zip(df[id_col], df[depth_col].astype(float)))
    else:
        parent = dict(zip(df[id_col], df[parent_col]))
        y = {}
        visiting = set()

        def depth(n):
            if n in y:
                return y[n]
            if n in visiting:
                raise ValueError(f"Cycle detected involving '{n}'.")
            visiting.add(n)
            p = parent.get(n, None)
            if p is None or p not in parent:
                d = 0.0
            else:
                d = depth(p) + 1.0
            visiting.remove(n)
            y[n] = d
            return d

        for n in df[id_col]:
            depth(n)

    return df, x, y

def make_arc_rad_fn(df, x, id_col="id", parent_col="pid", strength=0.25, max_rad=0.6):
    ranks = {}
    sub = df.dropna(subset=[parent_col])
    for pid, g in sub.groupby(parent_col)[id_col]:
        kids = list(g)
        kids_sorted = sorted(kids, key=lambda k: x.get(k, 0.0))
        m = len(kids_sorted)
        for i, nid in enumerate(kids_sorted):
            ranks[(pid, nid)] = (i, m)

    def rad(pid, nid, xp, yp, xc, yc):
        i, m = ranks.get((pid, nid), (0, 1))
        off = i - (m - 1) / 2.0
        s = np.sign(off) if off != 0 else (np.sign(xc - xp) if (xc - xp) != 0 else 1.0)

        dx = abs(xc - xp)
        dy = abs(yc - yp) + 1e-9
        geom = dx / dy

        mag = strength * (0.8 + 0.25 * abs(off)) * (0.6 + 0.4 * (1.0 / (1.0 + geom)))
        return float(np.clip(s * mag, -max_rad, max_rad))

    return rad

def plot_tree(
    df, x, y, id_col="id", parent_col="pid", label_col=None,
    edge_route="straight", orth_mode="hv", arc_rad=0.25,
    node_size=30, node_marker="o", node_facecolor="C0", node_edgecolor="k", node_linewidth=0.8, node_alpha=1.0,
    edge_color="0.6", edge_linestyle="-", edge_linewidth=1.0, edge_alpha=1.0,
    node_color_col=None, cmap="viridis", node_marker_col=None, color_map=None, marker_map=None,
    annotate=False, annot_size=8, invert_y=True, ax=None, figsize=(10, 6), title="Tree plot", show_legend=False,
):
    if ax is None:
        fig, ax = plt.subplots(figsize=figsize)
    else:
        fig = ax.figure

    rad_fn = None
    if edge_route == "arc" and (arc_rad == "auto" or callable(arc_rad)):
        rad_fn = make_arc_rad_fn(df, x, id_col=id_col, parent_col=parent_col) if arc_rad == "auto" else arc_rad

    # edges
    for _, row in df.iterrows():
        nid = row[id_col]
        pid = row[parent_col]
        if pid is None or pid not in x:
            continue

        xp, yp = x[pid], y[pid]
        xc, yc = x[nid], y[nid]

        if edge_route == "straight":
            ax.plot([xp, xc], [yp, yc], color=edge_color, linestyle=edge_linestyle, linewidth=edge_linewidth, alpha=edge_alpha, zorder=1)
        elif edge_route == "orthogonal":
            if orth_mode.lower() == "hv":
                xs, ys = [xp, xc, xc], [yp, yp, yc]
            elif orth_mode.lower() == "vh":
                xs, ys = [xp, xp, xc], [yp, yc, yc]
            else:
                raise ValueError("orth_mode must be 'hv' or 'vh'")
            ax.plot(xs, ys, color=edge_color, linestyle=edge_linestyle, linewidth=edge_linewidth, alpha=edge_alpha, zorder=1)
        elif edge_route == "arc":
            this_rad = rad_fn(pid, nid, xp, yp, xc, yc) if rad_fn else float(arc_rad)
            patch = FancyArrowPatch(
                (xp, yp), (xc, yc),
                arrowstyle="-",
                connectionstyle=f"arc3,rad={this_rad}",
                linewidth=edge_linewidth,
                linestyle=edge_linestyle,
                color=edge_color,
                alpha=edge_alpha,
                zorder=1,
                transform=ax.transData,
            )
            ax.add_patch(patch)
        else:
            raise ValueError("edge_route must be 'straight', 'orthogonal', or 'arc'")

    # nodes
    if node_color_col == "" : node_color_col = None
    if node_marker_col == "" : node_marker_col = None
    if label_col == "" : label_col = None

    if node_color_col is not None:
        vals = df[node_color_col].to_numpy()
        if np.issubdtype(df[node_color_col].dtype, np.number):
            node_colors = vals
            use_cmap = True
        else:
            cats = df[node_color_col].astype(str)
            if color_map is None:
                uniq = list(pd.unique(cats))
                cycle = plt.rcParams["axes.prop_cycle"].by_key().get("color", ["C0"])
                color_map = {u: cycle[i % len(cycle)] for i, u in enumerate(uniq)}
            node_colors = cats.map(lambda c: color_map[str(c)]).to_numpy()
            use_cmap = False
    else:
        node_colors = node_facecolor
        use_cmap = False

    if node_marker_col is not None:
        groups = df[node_marker_col].astype(str)
        if marker_map is None:
            uniq = list(pd.unique(groups))
            default_markers = ["o","s","^","D","v","P","X","*","h","p","<",">"]
            marker_map = {u: default_markers[i % len(default_markers)] for i, u in enumerate(uniq)}

        handles = []
        last_scatter = None
        for g in pd.unique(groups):
            mask = (groups == g).to_numpy()
            xs = df.loc[mask, id_col].map(x).to_numpy()
            ys = df.loc[mask, id_col].map(y).to_numpy()
            c = node_colors[mask] if isinstance(node_colors, np.ndarray) else node_colors

            sc = ax.scatter(xs, ys, s=node_size, marker=marker_map[str(g)],
                            c=c, cmap=(cmap if use_cmap else None),
                            edgecolors=node_edgecolor, linewidths=node_linewidth,
                            alpha=node_alpha, zorder=2)
            last_scatter = sc
            if show_legend:
                handles.append(Line2D([0],[0], marker=marker_map[str(g)], linestyle="",
                                      markerfacecolor="gray", markeredgecolor="k",
                                      label=str(g), markersize=8))
        if show_legend and handles:
            ax.legend(handles=handles, title=node_marker_col, loc="best")

        if node_color_col is not None and use_cmap and last_scatter is not None:
            cbar = fig.colorbar(last_scatter, ax=ax, pad=0.01)
            cbar.set_label(node_color_col)
    else:
        xs = df[id_col].map(x).to_numpy()
        ys = df[id_col].map(y).to_numpy()
        sc = ax.scatter(xs, ys, s=node_size, marker=node_marker,
                        c=node_colors, cmap=(cmap if (node_color_col and use_cmap) else None),
                        edgecolors=node_edgecolor, linewidths=node_linewidth,
                        alpha=node_alpha, zorder=2)
        if node_color_col is not None and use_cmap:
            cbar = fig.colorbar(sc, ax=ax, pad=0.01)
            cbar.set_label(node_color_col)

    if annotate:
        if label_col is not None and label_col in df.columns and label_col != "":
            labels = dict(zip(df[id_col], df[label_col].astype(str)))
            for n in df[id_col]:
                ax.text(x[n], y[n], labels[n], fontsize=annot_size, ha="center", va="bottom", zorder=3)
        else:
            for n in df[id_col]:
                ax.text(x[n], y[n], str(n), fontsize=annot_size, ha="center", va="bottom", zorder=3)

    ax.set_xlabel("")
    ax.set_xticks([])
    ax.set_ylabel("depth")
    if invert_y:
        ax.invert_yaxis()
    ax.set_title(title)
    plt.tight_layout()
    return fig, ax

def render_tree_plot(params_json: str):
    global DF
    if DF is None:
        raise ValueError("No CSV loaded yet.")

    p = json.loads(params_json)

    id_col = p.get("id_col", "id")
    parent_col = p.get("parent_col", "pid")
    depth_col = p.get("depth_col") or None

    df, x, y = compute_tree_layout(DF, id_col=id_col, parent_col=parent_col, depth_col=depth_col)

    def parse_json_dict(s):
        if s is None: return None
        s = str(s).strip()
        if s == "": return None
        return json.loads(s)

    color_map = parse_json_dict(p.get("color_map_json"))
    marker_map = parse_json_dict(p.get("marker_map_json"))

    out_format = (p.get("out_format") or "png").lower()
    fig_w = float(p.get("fig_w", 10))
    fig_h = float(p.get("fig_h", 6))
    fig_dpi = float(p.get("fig_dpi", 150))

    fig, ax = plot_tree(
        df, x, y,
        id_col=id_col, parent_col=parent_col,
        edge_route=p.get("edge_route", "straight"),
        orth_mode=p.get("orth_mode", "hv"),
        arc_rad=p.get("arc_rad", 0.25),

        node_size=float(p.get("node_size", 30)),
        node_marker=p.get("node_marker", "o"),
        node_facecolor=p.get("node_facecolor", "C0"),
        node_edgecolor=p.get("node_edgecolor", "k"),
        node_linewidth=float(p.get("node_linewidth", 0.8)),
        node_alpha=float(p.get("node_alpha", 1.0)),

        edge_color=p.get("edge_color", "0.6"),
        edge_linestyle=p.get("edge_linestyle", "-"),
        edge_linewidth=float(p.get("edge_linewidth", 1.0)),
        edge_alpha=float(p.get("edge_alpha", 1.0)),

        node_color_col=p.get("node_color_col") or None,
        node_marker_col=p.get("node_marker_col") or None,
        cmap=p.get("cmap", "viridis"),
        color_map=color_map,
        marker_map=marker_map,
        show_legend=bool(p.get("show_legend", False)),

        title=p.get("title", "Tree plot"),
        figsize=(fig_w, fig_h),
        invert_y=bool(p.get("invert_y", True)),
        annotate=bool(p.get("annotate", False)),
        annot_size=float(p.get("annot_size", 8)),
    )

    buf = io.BytesIO()
    if out_format == "svg":
        fig.savefig(buf, format="svg")
        mime, ext = "image/svg+xml", "svg"
    else:
        fig.savefig(buf, format="png", dpi=fig_dpi)
        mime, ext = "image/png", "png"

    plt.close(fig)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return {"mime": mime, "ext": ext, "base64": b64}
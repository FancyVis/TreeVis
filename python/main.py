import io
import base64

import pandas as pd
import matplotlib
matplotlib.use("AGG")  # use a non-interactive backend for PNG rendering
import matplotlib.pyplot as plt

import squarify  # will be installed via micropip in script.js
from matplotlib.colors import to_rgb


_df = None  # global DataFrame

try:
    font_path = "NotoSansSC-Regular.otf"
    fm.fontManager.addfont(font_path)
    cn_prop = fm.FontProperties(fname=font_path)

    # Set as global default
    plt.rcParams["font.family"] = cn_prop.get_name()
    plt.rcParams["axes.unicode_minus"] = False  # avoid minus sign issue
except Exception as e:
    print("Warning: could not configure Chinese font:", e)


def load_csv_from_text(text: str):
    """
    Load CSV from a string into a global DataFrame and return
    preview + column names.

    If the file has <= 50 rows, preview all of them.
    Otherwise preview only the first 5 rows.
    """
    global _df
    _df = pd.read_csv(io.StringIO(text))

    # --- NEW: interpret literal "\n" as newline in the "name" column ---
    if "name" in _df.columns:
        _df["name"] = (
            _df["name"]
            .astype(str)
            .str.replace("\\n", "\n", regex=False)  # turn "\n" into actual newline
        )

    total_rows = len(_df)

    if total_rows <= 50:
        preview_df = _df
        preview_is_full = True
    else:
        preview_df = _df.head(5)
        preview_is_full = False

    preview = preview_df.to_dict(orient="records")
    return {
        "columns": list(_df.columns),
        "preview": preview,
        "total_rows": int(total_rows),
        "preview_is_full": bool(preview_is_full),
    }


def generate_chart(
    label_col,
    value_col,
    chart_type="bar",
    color_col=None,
    color_mode="direct",
    base_color="#ffd700",
):
    """
    Use the previously-loaded DataFrame to generate a bar chart
    or treemap.

    color_col: optional name of a column to drive colors.
    color_mode:
      - "direct": values in color_col are used as matplotlib colors.
      - "numeric": numeric values mapped to a gradient based on base_color.
      - "binary": numeric/bool values mapped to base_color vs neutral color.

    base_color: hex or named color, used as the main accent.
    """
    if _df is None:
        raise ValueError("No CSV loaded yet.")

    if label_col not in _df.columns or value_col not in _df.columns:
        raise ValueError("Selected columns not found in data.")

    # Work on a subset of columns
    cols = [label_col, value_col]
    if color_col and color_col in _df.columns:
        cols.append(color_col)
    data = _df[cols].copy()

    # Ensure numeric values for the value column
    values_raw = pd.to_numeric(data[value_col], errors="coerce")
    valid = values_raw.notna()

    labels = data.loc[valid, label_col].astype(str)
    values = values_raw[valid]

    # Compute colors if requested
    colors = None
    if color_col and color_col in data.columns:
        series = data.loc[valid, color_col]

        if color_mode == "numeric":
            # Map numeric values to gradient from light sky to base_color
            num = pd.to_numeric(series, errors="coerce")
            if num.notna().any():
                vmin, vmax = num.min(), num.max()
                if vmin == vmax:
                    norm = pd.Series(0.5, index=num.index)
                else:
                    norm = (num - vmin) / (vmax - vmin)

                base_rgb = to_rgb(base_color)
                # very light sky tone as start of gradient
                light_rgb = (0.92, 0.97, 1.0)

                col_list = []
                for t in norm:
                    if pd.isna(t):
                        col_list.append(None)
                    else:
                        t = float(t)
                        r = light_rgb[0] + t * (base_rgb[0] - light_rgb[0])
                        g = light_rgb[1] + t * (base_rgb[1] - light_rgb[1])
                        b = light_rgb[2] + t * (base_rgb[2] - light_rgb[2])
                        col_list.append((r, g, b))
                colors = col_list

        elif color_mode == "binary":
            # Interpret as bool / binary
            if series.dtype == bool:
                bool_vals = series
            else:
                num = pd.to_numeric(series, errors="coerce")
                # non-zero → True, zero/NaN → False
                bool_vals = num.fillna(0) != 0

            true_rgb = to_rgb(base_color)
            # neutral light bluish gray for False
            false_rgb = (0.85, 0.9, 0.95)

            colors = [
                true_rgb if bool_val else false_rgb
                for bool_val in bool_vals
            ]

        else:
            # "direct": treat entries as matplotlib colors
            colors_series = series.astype(str)
            colors_list = [
                c if c.strip().lower() not in ("", "nan") else None
                for c in colors_series
            ]
            if any(c is not None for c in colors_list):
                colors = colors_list

    # Plot
    fig, ax = plt.subplots(figsize=(6, 4))

    if chart_type == "treemap":
        # squarify wants sizes that sum to something > 0
        total = values.sum()
        if total <= 0:
          raise ValueError("Values must sum to a positive number for treemap.")
        sizes = values / total

        squarify.plot(
            sizes=sizes,
            label=labels,
            value=values,
            ax=ax,
            pad=True,
            color=colors,  # may be None
        )
        ax.axis("off")
    else:
        # Bar chart
        ax.bar(labels, values, color=colors)
        plt.setp(ax.get_xticklabels(), rotation=45, ha="right")
        ax.set_ylabel(str(value_col))
        ax.set_xlabel(str(label_col))

    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150)
    plt.close(fig)
    buf.seek(0)
    img_bytes = buf.read()
    base64_str = base64.b64encode(img_bytes).decode("ascii")
    return base64_str

#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "bambu3mf @ git+https://github.com/gstark/bambu3mf",
#   "textual",
# ]
# ///
"""Tray editor for the Kallas Box. It writes a Bambu Studio project for one parts tray.

  just tray                             # open the editor
  just tray --length full --rows 6      # open the editor with these values
  just tray -y --width half --cols 2 --rows 5 --merge 0,1,1,2    # no editor

In the editor, set the size and the grid, then merge grid units into larger
compartments on the top view. Or press ctrl+f and answer questions about the
items to store: the editor finds the smallest trays that hold them. Type a label text for a compartment. The text
goes on a map inside the lid, and on a slide-in label on a second plate if the
compartment has label guides. A lid title goes on the outside of the lid.
"""

import argparse
import copy
import re
import sys

from rich.text import Text
from textual import on, work
from textual.worker import get_current_worker
from textual.app import App
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.message import Message
from textual.screen import ModalScreen
from textual.widget import Widget
from textual.widgets import (Button, Checkbox, Footer, Header, Input, Label, OptionList, RadioButton, RadioSet,
                             RichLog, Static)
from textual.widgets.option_list import Option

import fit
from common import ModelError
from tray_model import COLS, HEIGHTS, LENGTHS, ROWS, WIDTHS, Spec, export, inspect

# (up, down, left, right) -> line character
BOX = {
    (1, 1, 0, 0): "│", (0, 0, 1, 1): "─", (0, 1, 0, 1): "╭", (0, 1, 1, 0): "╮", (1, 0, 0, 1): "╰",
    (1, 0, 1, 0): "╯", (1, 1, 0, 1): "├", (1, 1, 1, 0): "┤", (0, 1, 1, 1): "┬", (1, 0, 1, 1): "┴",
    (1, 1, 1, 1): "┼", (1, 0, 0, 0): "╵", (0, 1, 0, 0): "╷", (0, 0, 1, 0): "╴", (0, 0, 0, 1): "╶",
    (0, 0, 0, 0): " ",
}
WALL = "#8fa3bf"
TEXT = "#d7dee8"
SOLID = "#6b7280 on #2a2f38"
ACTIVE = "on #24405c"      # the compartment under the cursor
SELECTED = "on #2f6ea5"    # the selected grid units
CURSOR = "bold on #4a9be0"
LABEL = "bold #f2c14e"


class GridEditor(Widget, can_focus=True):
    """Top view of the tray. The cursor moves between compartments. A selection covers grid units."""

    ALLOW_SELECT = False   # a drag selects grid units, not text
    BINDINGS = [
        Binding("up", "move(0, 1)", show=False), Binding("down", "move(0, -1)", show=False),
        Binding("left", "move(-1, 0)", show=False), Binding("right", "move(1, 0)", show=False),
        Binding("shift+up", "select(0, 1)", show=False), Binding("shift+down", "select(0, -1)", show=False),
        Binding("shift+left", "select(-1, 0)", show=False), Binding("shift+right", "select(1, 0)", show=False),
        Binding("m", "merge", "Merge selection"), Binding("s", "split", "Split"),
        Binding("enter", "label", "Edit label"),
        Binding("escape", "clear", show=False),
    ]

    class Edited(Message):
        """The merges changed."""

    class Moved(Message):
        """The cursor or the selection changed."""

    class LabelWanted(Message):
        """The user wants to type the label of the compartment under the cursor."""

    def __init__(self, spec):
        super().__init__()
        self.spec = spec
        self.info = None        # what the model reports. None while the model rejects the tray.
        self.cursor = (0, 0)    # grid unit (col, row). Row 0 is the front.
        self.anchor = None      # the other corner of the selection
        self._drag = None

    def check_action(self, action, parameters):
        return self.info is not None

    def selection(self):
        (c0, r0), (c1, r1) = self.anchor or self.cursor, self.cursor
        return min(c0, c1), min(r0, r1), abs(c0 - c1) + 1, abs(r0 - r1) + 1

    def comp_at(self, unit):
        for k in self.info.comps if self.info else []:
            if k.col <= unit[0] < k.col + k.cols and k.row <= unit[1] < k.row + k.rows:
                return k

    def cell_size(self):
        """Characters in one grid unit, close to its real proportions."""
        room = self.parent.size.height - 3   # lines for the grid, without the captions
        high = max(1, min(3, room // self.spec.rows - 1))
        wide = round((high + 1) * 2.1 * self.info.unit_w / self.info.unit_l) - 1
        return max(5, min(wide, (self.size.width - 1) // self.spec.cols - 1)), high

    def render(self):
        info, cols, rows = self.info, self.spec.cols, self.spec.rows
        if info is None:
            return Text("")
        wide, high = self.cell_size()
        owner = {(c, r): i for i, k in enumerate(info.comps)
                 for c in range(k.col, k.col + k.cols) for r in range(k.row, k.row + k.rows)}

        def wall_left(c, r):
            return c in (0, cols) or owner.get((c - 1, r)) != owner.get((c, r))

        def wall_front(c, r):
            return r in (0, rows) or owner.get((c, r - 1)) != owner.get((c, r))

        def x(c):
            return c * (wide + 1)

        def y(r):   # screen line of the front side of row r. The front is at the bottom.
            return (rows - r) * (high + 1)

        width, height = x(cols) + 1, y(0) + 1
        chars = [[" "] * width for _ in range(height)]
        styles = [[WALL] * width for _ in range(height)]

        def fill(c, r, w, h, style):
            for line in range(y(r + h) + 1, y(r)):
                for col in range(x(c) + 1, x(c + w)):
                    styles[line][col] = style

        def write(c, r, w, h, line, text, style=None):
            start = x(c) + 1 + max(0, (x(c + w) - x(c) - 1 - len(text)) // 2)
            for i, ch in enumerate(text[:x(c + w) - x(c) - 1]):
                chars[y(r + h) + 1 + line][start + i] = ch
                if style:
                    styles[y(r + h) + 1 + line][start + i] += " " + style

        for c in range(cols + 1):
            for r in range(rows + 1):
                if r < rows and wall_left(c, r):
                    for line in range(y(r + 1) + 1, y(r)):
                        chars[line][x(c)] = "│"
                if c < cols and wall_front(c, r):
                    for col in range(x(c) + 1, x(c + 1)):
                        chars[y(r)][col] = "─"
                chars[y(r)][x(c)] = BOX[(int(r < rows and wall_left(c, r)), int(r > 0 and wall_left(c, r - 1)),
                                         int(c > 0 and wall_front(c - 1, r)), int(c < cols and wall_front(c, r)))]

        active = self.comp_at(self.cursor)
        for k in info.comps:
            box = (k.col, k.row, k.cols, k.rows)
            lines = k.rows * (high + 1) - 1
            fill(*box, SOLID if not k.usable else f"{TEXT} {ACTIVE}" if k is active else TEXT)
            write(*box, lines // 2, f"{k.width:.0f}×{k.length:.0f}" if k.usable else "solid")
        if self.anchor:
            fill(*self.selection(), f"{TEXT} {SELECTED}")
        if self.has_focus:
            fill(*self.cursor, 1, 1, f"{TEXT} {CURSOR}")
        for k in info.comps:   # the label is on the back wall
            label = self.spec.labels.get((k.col, k.row))
            if k.usable and (label or k.guided) and k.rows * (high + 1) - 1 >= 2:
                write(k.col, k.row, k.cols, k.rows, 0, label or "━━━", LABEL if label else None)

        out = Text(no_wrap=True)
        out.append("back".center(width) + "\n", "dim")
        for line in range(height):
            for col in range(width):
                out.append(chars[line][col], styles[line][col])
            out.append("\n")
        if info.pocket:
            out.append(("▀" * round(width * info.pocket / info.width)).center(width) + "\n", "#e0a44a")
            out.append("front, with the finger pocket".center(width), "dim")
        else:
            out.append("front".center(width), "dim")
        return out

    def unit_at(self, event):
        offset = event.get_content_offset(self)
        if offset is None or self.info is None:
            return None
        wide, high = self.cell_size()
        c, r = offset.x // (wide + 1), self.spec.rows - 1 - (offset.y - 1) // (high + 1)
        return (c, r) if 0 <= c < self.spec.cols and 0 <= r < self.spec.rows else None

    def moved(self):
        self.refresh()
        self.post_message(self.Moved())

    def on_mouse_down(self, event):
        unit = self.unit_at(event)
        if unit:
            self.capture_mouse()
            self._drag, self.cursor, self.anchor = unit, unit, None
            self.moved()

    def on_mouse_move(self, event):
        unit = self._drag and self.unit_at(event)
        if unit and unit != self.cursor:
            self.anchor, self.cursor = self._drag, unit
            self.moved()

    def on_mouse_up(self, event):
        self._drag = None
        self.release_mouse()

    def on_focus(self):
        self.refresh()

    def on_blur(self):
        self.refresh()

    def step(self, unit, dc, dr):
        return (min(max(unit[0] + dc, 0), self.spec.cols - 1), min(max(unit[1] + dr, 0), self.spec.rows - 1))

    def action_move(self, dc, dr):
        """Go to the next compartment in this direction."""
        here, unit = self.comp_at(self.cursor), self.cursor
        while self.comp_at(unit) is here and self.step(unit, dc, dr) != unit:
            unit = self.step(unit, dc, dr)
        if self.comp_at(unit) is not here:
            self.cursor = unit
        self.anchor = None
        self.moved()

    def action_select(self, dc, dr):
        self.anchor = self.anchor or self.cursor
        self.cursor = self.step(self.cursor, dc, dr)
        self.moved()

    def action_label(self):
        self.post_message(self.LabelWanted())

    def action_clear(self):
        self.anchor = None
        self.moved()

    def action_merge(self):
        c, r, w, h = self.selection()
        if w * h == 1:
            self.app.notify("Select 2 or more grid units first. Hold shift and press an arrow key, or drag.")
            return
        # A merge that overlaps the selection goes back to single units
        self.spec.merges = [m for m in self.spec.merges
                            if not (m[0] < c + w and c < m[0] + m[2] and m[1] < r + h and r < m[1] + m[3])]
        self.spec.merges.append((c, r, w, h))
        self.anchor = None
        self.post_message(self.Edited())

    def action_split(self):
        c, r = self.cursor
        keep = [m for m in self.spec.merges if not (m[0] <= c < m[0] + m[2] and m[1] <= r < m[1] + m[3])]
        if len(keep) == len(self.spec.merges):
            self.app.notify("This compartment is not a merge.")
            return
        self.spec.merges = keep
        self.post_message(self.Edited())


class Interview(ModalScreen):
    """Questions about the items to store, one at a time. It finds the trays that hold them.

    The screen returns the spec of the chosen tray, or None.
    """

    BINDINGS = [Binding("escape", "dismiss(None)", "Close")]
    DEFAULT_CSS = """
    Interview { align: center middle; }
    #interview { width: 96; max-width: 100%; height: 90%; border: round $primary; background: $surface; padding: 0 1; }
    #talk { height: 1fr; }
    #question { margin-top: 1; text-style: bold; }
    #results { height: auto; max-height: 70%; display: none; }
    """
    QUESTIONS = {
        "name": ("What do you want to store? Type a short name. The name becomes the label of its compartments. "
                 "You can leave it empty.", "for example WAGO 2"),
        "size": ("Measure one at its largest point. Type the width, length, and height in mm.", "for example 42x38x17"),
        "count": ("How many do you have?", "1"),
        "loose": ("Does each one get its own compartment, or do they all go loose into one compartment? "
                  "Type e for each or l for loose.", "e or l"),
        "more": ("Do you have another item to store? Type y or n.", "y or n"),
        "heights": ("Which tray heights can I use? Type any, or one or more of "
                    f"{' '.join(f'{h:g}' for h in HEIGHTS)}.", "any"),
    }

    def __init__(self, base):
        super().__init__()
        self.base = base      # the editor spec: pull, guides, title, and name come from it
        self.items = []
        self.item = None      # the item that the questions are about
        self.step = "name"
        self.found = []

    def compose(self):
        with Vertical(id="interview"):
            yield RichLog(id="talk", wrap=True, markup=False)
            yield Static(id="question")
            yield Input(id="answer")
            yield OptionList(id="results")

    def on_mount(self):
        self.query_one("#interview").border_title = "Find a tray for your items"
        self.query_one("#interview").border_subtitle = "enter answers · escape closes"
        self.ask()

    def ask(self, error=""):
        question, example = self.QUESTIONS[self.step]
        self.query_one("#question", Static).update(Text.assemble((error + "\n", "bold red") if error else "", question))
        field = self.query_one("#answer", Input)
        field.value, field.placeholder = "", example
        field.focus()

    @on(Input.Changed)
    def keep_input(self, event):
        event.stop()   # the editor form has its own Input.Changed handler

    @on(Input.Submitted, "#answer")
    def answered(self, event):
        event.stop()
        text, step = event.value.strip(), self.step
        error = getattr(self, f"answer_{step}")(text)
        if error:
            self.ask(error)
            return
        talk = self.query_one("#talk", RichLog)
        talk.write(Text(self.QUESTIONS[step][0], "dim"))
        talk.write(Text(f"› {text or '(empty)'}", "bold"))
        if step in ("count", "loose") and self.item is None:   # the item is complete
            it = self.items[-1]
            talk.write(Text(f"Item {fit.LETTERS[len(self.items) - 1]}: {fit.describe(it)}  {it.name}", "#f2c14e"))
        if self.step != "search":
            self.ask()

    def answer_name(self, text):
        self.item = fit.Item(text, 0, 0, 0, 1)
        self.step = "size"

    def answer_size(self, text):
        sizes = [v for v in re.split(r"[x×*,\s]+", text.lower()) if v]
        try:
            w, l, h = (float(v) for v in sizes)
        except ValueError:
            return "Type three numbers, for example 42x38x17."
        if min(w, l, h) <= 0:
            return "Each size must be more than 0."
        self.item.w, self.item.l, self.item.h = w, l, h
        self.step = "count"

    def answer_count(self, text):
        try:
            count = int(text or 1)
        except ValueError:
            return "Type a whole number."
        if count < 1:
            return "Type 1 or more."
        self.item.count = count
        if count > 1:
            self.step = "loose"
        else:
            self.add()

    def answer_loose(self, text):
        if text.lower()[:1] not in ("e", "l"):
            return "Type e or l."
        self.item.loose = text.lower().startswith("l")
        self.add()

    def add(self):
        self.items.append(self.item)
        self.item = None
        self.step = "more" if len(self.items) < len(fit.LETTERS) else "heights"

    def answer_more(self, text):
        if text.lower()[:1] not in ("y", "n"):
            return "Type y or n."
        self.step = "name" if text.lower().startswith("y") else "heights"

    def answer_heights(self, text):
        if text.lower() in ("", "any"):
            heights = HEIGHTS
        else:
            try:
                heights = sorted({float(v) for v in re.split(r"[,\s]+", text) if v})
            except ValueError:
                heights = []
            if not heights or any(h not in HEIGHTS for h in heights):
                return f"Type any, or heights from this list: {' '.join(f'{h:g}' for h in HEIGHTS)}."
        self.step = "search"
        self.query_one("#answer", Input).display = False
        self.query_one("#question", Static).update("Looking for trays. This takes a few seconds.")
        self.search(heights)

    @work(thread=True, exclusive=True)
    def search(self, heights):
        try:
            found, error = fit.find(self.items, self.base.pull, self.base.guides, heights=heights), None
        except ModelError as failed:
            found, error = [], str(failed)
        self.app.call_from_thread(self.show, found, error)

    def show(self, found, error):
        self.found = found
        question = self.query_one("#question", Static)
        if error:
            question.update(Text(f"The model failed: {error}", "bold red"))
            return
        if not found:
            question.update(Text("No single tray holds these items. Split them into two or more sets. "
                                 "Press escape to close.", "bold yellow"))
            return
        question.update("Choose a tray. Press enter to load it into the editor.")
        results = self.query_one("#results", OptionList)
        for n, (plan, spec) in enumerate(found, 1):
            lines = [Text(f"{n}. {fit.title(plan, spec)}", "bold")]
            lines += [Text(f"   {line}", "dim" if line in ("back", "front") else "") for line in fit.tray_map(plan)]
            lines += [Text(f"   {fit.LETTERS[i]}  {it.name or fit.describe(it)}", "#f2c14e")
                      for i, it in enumerate(self.items)]
            results.add_option(Option(Text("\n").join(lines)))
        results.display = True
        results.highlighted = 0
        results.focus()

    @on(OptionList.OptionSelected, "#results")
    def chosen(self, event):
        spec = self.found[event.option_index][1]
        spec.title, spec.name = self.base.title, self.base.name
        self.dismiss(spec)


class TrayApp(App):
    TITLE = "Kallas tray"
    ENABLE_COMMAND_PALETTE = False
    BINDINGS = [Binding("ctrl+f", "find", "Find a tray for my items"), Binding("ctrl+g", "generate", "Generate 3MF"),
                Binding("ctrl+q", "quit", "Quit")]
    CSS = """
    #form { width: 46; border: round $primary; padding: 0 1; }
    #view { border: round $primary; padding: 0 2; height: 1fr; }
    #info { border: round $secondary; padding: 0 1; height: auto; }
    #label { border: round $secondary; height: 3; }
    #log { border: round $secondary; padding: 0 1; height: 7; overflow-y: auto; overflow-x: hidden; }
    GridEditor { height: auto; }
    .field { margin-top: 1; text-style: bold; color: $text-muted; }
    RadioSet { layout: horizontal; border: none; padding: 0; width: 100%; background: transparent; }
    RadioButton { width: auto; margin-right: 1; }
    /* Show the RadioSet cursor only when the set has the focus */
    RadioSet:blur > RadioButton.-selected > .toggle--label { background: transparent; }
    Checkbox { width: 100%; }
    #grid Label { padding: 1 1 0 0; }
    #grid Input { width: 9; }
    #grid { height: 3; }
    #generate, #find { width: 100%; margin-top: 1; }
    """

    def __init__(self, spec, output=None):
        super().__init__()
        self.spec = spec
        self.output = output
        self.error = None

    def compose(self):
        spec = self.spec
        other = spec.height not in HEIGHTS
        yield Header()
        with Horizontal():
            with VerticalScroll(id="form"):
                yield Label("Length", classes="field")
                yield RadioSet(*[RadioButton(n, value=n == spec.length, id=f"length-{n}") for n in LENGTHS], id="length")
                yield Label("Width", classes="field")
                yield RadioSet(*[RadioButton(n, value=n == spec.width, id=f"width-{n}") for n in WIDTHS], id="width")
                yield Label("Height with the lid, mm", classes="field")
                yield RadioSet(*[RadioButton(str(h), value=h == spec.height, id=f"height-{h}") for h in HEIGHTS],
                               RadioButton("other", value=other, id="height-other"), id="height")
                yield Input(f"{spec.height:g}" if other else "", placeholder="14 to 98", type="number",
                            id="height-value", disabled=not other)
                yield Label("Grid units", classes="field")
                with Horizontal(id="grid"):
                    yield Label("across")
                    yield Input(str(spec.cols), type="integer", id="cols")
                    yield Label(" along")
                    yield Input(str(spec.rows), type="integer", id="rows")
                yield Checkbox("Finger pocket in the front end", spec.pull, id="pull", classes="field")
                yield Checkbox("Label guides", spec.guides, id="guides")
                yield Label("Lid title, on the outside", classes="field")
                yield Input(spec.title, max_length=24, id="title")
                yield Label("File name", classes="field")
                yield Input(spec.name, id="name")
                yield Button("Find a tray for my items", id="find")
                yield Button("Generate 3MF", variant="primary", id="generate")
            with Vertical():
                with VerticalScroll(id="view"):
                    yield GridEditor(spec)
                yield Input(id="label", max_length=16)
                yield Static(id="info")
                yield RichLog(id="log", wrap=True, markup=False)
        yield Footer()

    def on_mount(self):
        self.query_one("#form").border_title = "Tray"
        self.query_one("#view").border_title = "Compartments, seen from the top"
        self.query_one("#view").border_subtitle = "arrows move · shift+arrows or drag select"
        self.query_one("#label").border_title = "Label of this compartment"
        self.query_one("#info").border_title = "Sizes"
        self.query_one("#log").border_title = "Output"
        self.query_one(GridEditor).focus()
        self.model_changed()

    def on_resize(self):
        self.query_one(GridEditor).refresh(layout=True)   # the grid fits itself to the space

    # -- form ---------------------------------------------------------------

    @on(RadioSet.Changed)
    def radio_changed(self, event):
        field, _, value = event.pressed.id.partition("-")
        # A value that is already in the spec came from a found tray. Keep its grid.
        if field == "length" and value != self.spec.length:
            self.spec.length = value
            self.query_one("#rows", Input).value = str(ROWS[value])
        elif field == "width" and value != self.spec.width:
            self.spec.width = value
            self.query_one("#cols", Input).value = str(COLS[value])
        elif field in ("length", "width"):
            pass
        else:
            self.query_one("#height-value", Input).disabled = value != "other"
            if value != "other":
                self.spec.height = int(value)
        self.model_changed()

    @on(Input.Changed)
    def input_changed(self, event):
        field, text = event.input.id, event.value.strip()
        if field in ("name", "title"):
            setattr(self.spec, field, text)
            return
        if field == "label":
            editor = self.query_one(GridEditor)
            here = editor.comp_at(editor.cursor)
            if here:
                self.spec.labels.pop((here.col, here.row), None)
                if text:
                    self.spec.labels[here.col, here.row] = text
                editor.refresh()
                self.show_sizes(follow=False)   # do not replace the text that the user types
            return
        try:
            value = float(text) if field == "height-value" else int(text)
        except ValueError:
            return
        if field == "height-value":
            self.spec.height = value
        elif value >= 1 and value != getattr(self.spec, field):
            setattr(self.spec, field, value)
            self.spec.merges, self.spec.labels = [], {}   # a new grid starts with single units
            editor = self.query_one(GridEditor)
            editor.cursor, editor.anchor = (0, 0), None
        self.model_changed()

    @on(Checkbox.Changed)
    def checkbox_changed(self, event):
        setattr(self.spec, event.checkbox.id, event.value)
        self.model_changed()

    @on(GridEditor.Edited)
    def grid_edited(self):
        self.model_changed()

    @on(GridEditor.Moved)
    def cursor_moved(self):
        self.show_sizes()

    @on(GridEditor.LabelWanted)
    def label_wanted(self):
        field = self.query_one("#label", Input)
        if field.disabled:
            self.notify("This compartment is solid.")
        else:
            field.focus()

    @on(Input.Submitted, "#label")
    def label_done(self):
        self.query_one(GridEditor).focus()

    # -- model --------------------------------------------------------------

    @work(thread=True, exclusive=True, group="inspect")
    def model_changed(self):
        """Ask the model for the sizes of the tray, then draw it."""
        spec = copy.deepcopy(self.spec)
        try:
            info, error = inspect(spec), None
        except ModelError as failed:
            info, error = None, str(failed)
        if not get_current_worker().is_cancelled:   # a newer change replaced this one
            self.call_from_thread(self.model_ready, info, error)

    def model_ready(self, info, error):
        editor = self.query_one(GridEditor)
        self.error = error
        editor.info = info
        editor.refresh(layout=True)
        self.query_one("#name", Input).placeholder = self.spec.auto_name()
        self.query_one("#generate", Button).disabled = bool(error)
        self.show_sizes()

    def show_sizes(self, follow=True):
        editor = self.query_one(GridEditor)
        info, here = editor.info, editor.comp_at(editor.cursor)
        if self.error:
            text = f"[b red]{self.error}[/]"
        elif info is None:
            text = ""
        else:
            text = (f"[b]Tray[/b]         {info.width:g} × {info.length:g} × {info.height:g} mm\n"
                    f"[b]Grid unit[/b]    {info.unit_w:.1f} × {info.unit_l:.1f} mm, {info.depth:.1f} mm deep\n")
            if here and here.usable:
                text += (f"[b]Compartment[/b]  {here.width:.1f} × {here.length:.1f} mm, "
                         f"{'with' if here.guided else 'no'} label guides")
            elif here:
                text += ("[b]Compartment[/b]  [yellow]solid: too short behind the finger pocket. "
                         "Merge it with the unit behind it, or turn off the pocket.[/]")
            count, on_lid = len(info.labels(self.spec)), info.lid_labels(self.spec)
            text += (f"\n[b]Labels[/b]       {on_lid} on the lid map, {count} on plate 2" if on_lid else
                     "\n[dim]━━━ label guides on the back wall. Press enter to type a label.[/dim]")
        self.query_one("#info", Static).update(text)

        if not follow:
            return
        # The label field follows the cursor
        field = self.query_one("#label", Input)
        with field.prevent(Input.Changed):
            field.value = self.spec.labels.get((here.col, here.row), "") if here else ""
        field.disabled = not (here and here.usable)
        field.placeholder = ("solid compartment" if not (here and here.usable) else
                             "about 6 characters print well" if here.guided else "lid map only: no label guides")

    # -- find a tray --------------------------------------------------------

    @on(Button.Pressed, "#find")
    def action_find(self):
        self.push_screen(Interview(copy.deepcopy(self.spec)), self.load)

    def load(self, found):
        """Put a found tray in the editor. Set the spec first: the form events then change nothing."""
        if found is None:
            return
        for name in ("length", "width", "height", "cols", "rows", "merges", "labels"):
            setattr(self.spec, name, getattr(found, name))
        self.query_one(f"#length-{found.length}", RadioButton).value = True
        self.query_one(f"#width-{found.width}", RadioButton).value = True
        self.query_one(f"#height-{found.height:g}", RadioButton).value = True
        self.query_one("#cols", Input).value = str(found.cols)
        self.query_one("#rows", Input).value = str(found.rows)
        editor = self.query_one(GridEditor)
        editor.cursor, editor.anchor = (0, 0), None
        editor.info = None   # the old sizes do not match the new grid
        editor.focus()
        self.model_changed()
        self.notify("The editor has the tray. You can change it before you generate the 3MF.")

    # -- export -------------------------------------------------------------

    @on(Button.Pressed, "#generate")
    def action_generate(self):
        if self.error:
            self.notify(self.error, severity="error")
            return
        self.query_one("#generate", Button).loading = True
        self.generate(copy.deepcopy(self.spec))

    @work(thread=True, exclusive=True, group="export")
    def generate(self, spec):
        log = self.query_one("#log", RichLog)
        try:
            export(spec, self.output, lambda line: self.call_from_thread(log.write, line))
        except ModelError as failed:
            self.call_from_thread(log.write, f"Error: {failed}")
        self.call_from_thread(setattr, self.query_one("#generate", Button), "loading", False)


def merge_arg(text):
    try:
        col, row, wide, long = (int(v) for v in text.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError("use COL,ROW,WIDE,LONG, for example 0,1,2,1")
    return col, row, wide, long


def label_arg(text):
    try:
        unit, _, label = text.partition("=")
        col, row = (int(v) for v in unit.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError("use COL,ROW=TEXT, for example 0,1=M3x8")
    return (col, row), label


def main():
    ap = argparse.ArgumentParser(
        description="Edit one parts tray and write a Bambu Studio project for it. "
                    "The options set the values that the editor starts with.")
    ap.add_argument("--length", choices=LENGTHS, default="half", help="245, 122, or 60.5 mm (default: half)")
    ap.add_argument("--width", choices=WIDTHS, default="full", help="95 or 47 mm (default: full)")
    ap.add_argument("--height", type=float, default=24,
                    help="total height with the lid, in mm. 24, 32, 48, and 96 stack "
                         "to fill the Kallas Box (default: 24)")
    ap.add_argument("--cols", type=int, help="grid units across the width (default: 3, or 2 for half width)")
    ap.add_argument("--rows", type=int, help="grid units along the length (default: 8, 4, or 2)")
    ap.add_argument("--merge", type=merge_arg, action="append", default=[], metavar="COL,ROW,WIDE,LONG",
                    help="merge grid units into one compartment. COL and ROW start at 0 at the "
                         "front left. You can use this option more than once")
    ap.add_argument("--pull", action=argparse.BooleanOptionalAction, default=True,
                    help="finger pocket in the front end (default: on)")
    ap.add_argument("--guides", action=argparse.BooleanOptionalAction, default=True,
                    help="label guides on the back wall of each compartment (default: on)")
    ap.add_argument("--label", type=label_arg, action="append", default=[], metavar="COL,ROW=TEXT",
                    help="label text for the compartment whose front left unit is COL,ROW. The text goes "
                         "on the lid map, and on a slide-in label on plate 2 if the compartment has "
                         "label guides. You can use this option more than once")
    ap.add_argument("--title", default="", help="text on the outside of the lid")
    ap.add_argument("--name", default="", help="file name without .3mf (default: made from the options)")
    ap.add_argument("-y", "--yes", action="store_true", help="write the file now, with no editor")
    ap.add_argument("-o", "--output", help="output file (default: 3mf/<name>.3mf)")
    args = ap.parse_args()

    spec = Spec(length=args.length, width=args.width, height=args.height,
                cols=args.cols or COLS[args.width], rows=args.rows or ROWS[args.length],
                merges=args.merge, pull=args.pull, guides=args.guides, labels=dict(args.label),
                title=args.title, name=args.name)
    if args.yes or not sys.stdin.isatty():
        try:
            export(spec, args.output)
        except ModelError as failed:
            sys.exit(f"Error: {failed}")
    else:
        TrayApp(spec, args.output).run()


if __name__ == "__main__":
    main()

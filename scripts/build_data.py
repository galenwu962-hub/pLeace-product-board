from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, asdict
from datetime import date, datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_CSV = Path("/Users/wuzhiyang/Downloads/南京德基开业倒计时总控表.csv")
OUTPUT_JS = ROOT / "data" / "dashboard-data.js"
OUTPUT_JSON = ROOT / "data" / "dashboard-data.json"


DATE_RE = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})$")
DATE_TIME_RE = re.compile(r"^(\d{4}/\d{1,2}/\d{1,2})(?:\s+(.+))?$")
RANGE_SHORT_RE = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})~(\d{1,2})/(\d{1,2})$")
RANGE_FULL_RE = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})~(\d{4})/(\d{1,2})/(\d{1,2})$")
RANGE_DAY_RE = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})-(\d{1,2})号$")


PROJECT_START = date(2026, 5, 8)
OPENING_DAY = date(2026, 6, 18)
TODAY = date.today()


PHASES = [
    (date(2026, 5, 8), date(2026, 5, 31), "团队与训练"),
    (date(2026, 6, 1), date(2026, 6, 7), "迁店与基础交付"),
    (date(2026, 6, 8), date(2026, 6, 12), "物料与系统到店"),
    (date(2026, 6, 13), date(2026, 6, 17), "联调与开业冲刺"),
    (date(2026, 6, 18), date(2026, 6, 18), "正式开业"),
]

DEPARTMENT_ALIASES = {
    "运营": "运营部",
    "营运": "运营部",
    "运营部": "运营部",
    "采购": "采购部",
    "采购部": "采购部",
    "训练": "训练部",
    "训练部": "训练部",
    "厨政": "厨政部",
    "厨政部": "厨政部",
    "市场": "市场部",
    "市场部": "市场部",
    "研发": "研发部",
    "研发部": "研发部",
    "HR": "人资部",
    "人资": "人资部",
    "人资部": "人资部",
    "食安": "食安部",
    "食安部": "食安部",
}


MANUAL_DATE_LABELS = {
    "管理组伙伴6大管理系统集训": "待确认（建议补充到 5/12-5/18）",
    "食品经营许可证证照办理": "待确认（持续跟进项）",
    "相关定制物料完成设计、订货、并运输到店/所有物料及包装到货": "待确认（应在 6/11 前完成）",
    "工器具定位、工程遗留问题整改": "待确认（建议补充到 6/12-6/15）",
    "伙伴工衣到货": "待确认（建议补充到 6/14-6/15）",
    "门店推广物料、装饰等陈列完成": "待确认（建议补充到 6/14-6/15）",
    "营销活动讲解会议及活动测试": "待确认（建议补充到 6/14-6/15）",
    "排队压力测试": "待确认（建议补充到 6/15-6/16）",
    "热厨、水吧能出餐": "待确认（建议补充到 6/15-6/16）",
}


@dataclass
class Task:
    id: str
    row_number: int
    title: str
    description: str
    department: str
    owner: str
    collaborators: str
    notes: str
    reviewer: str
    start_date: str | None
    end_date: str | None
    date_label: str
    time_note: str
    has_confirmed_date: bool
    needs_date_confirmation: bool
    phase: str
    status_hint: str
    risk_level: str
    days_to_deadline: int | None


def clean_text(value: str) -> str:
    text = (value or "").replace("\r", "\n")
    text = re.sub(r"\n+", "\n", text)
    return text.strip()


def is_date_like(value: str) -> bool:
    value = value.strip()
    if not value:
        return False
    return any(
        pattern.match(value)
        for pattern in (DATE_RE, DATE_TIME_RE, RANGE_SHORT_RE, RANGE_FULL_RE, RANGE_DAY_RE)
    )


def normalize_row(row: list[str]) -> dict[str, str]:
    values = [clean_text(cell) for cell in (row[:8] + [""] * 8)[:8]]
    if is_date_like(values[0]):
        mapped = values
    else:
        mapped = [""] + values[:7]
    return {
        "raw_date": mapped[0],
        "title": mapped[1],
        "description": mapped[2],
        "department": mapped[3],
        "owner": mapped[4],
        "collaborators": mapped[5],
        "notes": mapped[6],
        "reviewer": mapped[7],
    }


def normalize_department(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    primary = re.split(r"[\/、,，\s]+", raw)[0]
    return DEPARTMENT_ALIASES.get(primary, raw)


def parse_dates(raw_date: str, title: str) -> tuple[str | None, str | None, str, str, bool]:
    raw_date = raw_date.strip()
    if not raw_date:
        return None, None, MANUAL_DATE_LABELS.get(title, "待确认"), "", False

    match = RANGE_FULL_RE.match(raw_date)
    if match:
        start = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        end = date(int(match.group(4)), int(match.group(5)), int(match.group(6)))
        return start.isoformat(), end.isoformat(), raw_date, "", True

    match = RANGE_SHORT_RE.match(raw_date)
    if match:
        start = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        end = date(start.year, int(match.group(4)), int(match.group(5)))
        return start.isoformat(), end.isoformat(), raw_date, "", True

    match = RANGE_DAY_RE.match(raw_date)
    if match:
        start = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        end = date(start.year, start.month, int(match.group(4)))
        return start.isoformat(), end.isoformat(), raw_date, "", True

    match = DATE_TIME_RE.match(raw_date)
    if match:
        base = datetime.strptime(match.group(1), "%Y/%m/%d").date()
        time_note = match.group(2) or ""
        return base.isoformat(), base.isoformat(), raw_date, time_note, True

    return None, None, MANUAL_DATE_LABELS.get(title, raw_date), "", False


def get_phase(end_date: str | None) -> str:
    if not end_date:
        return "待补日期"
    current = date.fromisoformat(end_date)
    for start, end, label in PHASES:
        if start <= current <= end:
            return label
    return "其他"


def get_status_hint(start_date: str | None, end_date: str | None) -> str:
    if not end_date:
        return "待补日期"
    start = date.fromisoformat(start_date or end_date)
    end = date.fromisoformat(end_date)
    if end < TODAY:
        return "已逾期"
    if start <= TODAY <= end:
        return "进行中"
    if 0 < (start - TODAY).days <= 3:
        return "临近开始"
    return "未开始"


def get_risk_level(task: Task) -> str:
    if not task.owner or not task.department:
        return "高"
    if task.needs_date_confirmation:
        return "高"
    if task.status_hint in {"已逾期", "临近开始"}:
        return "高"
    if task.collaborators in {"", "All"}:
        return "中"
    if task.reviewer == "":
        return "中"
    return "低"


def days_to_deadline(end_date: str | None) -> int | None:
    if not end_date:
        return None
    return (date.fromisoformat(end_date) - TODAY).days


def slug(text: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", text).strip("-")
    return base or "task"


def build_tasks() -> list[Task]:
    with SOURCE_CSV.open("r", encoding="utf-8-sig", newline="") as file:
        rows = list(csv.reader(file))

    tasks: list[Task] = []
    for row_number, row in enumerate(rows[2:], start=3):
        normalized = normalize_row(row)
        if not any(normalized.values()):
            continue
        start_date, end_date, date_label, time_note, has_confirmed_date = parse_dates(
            normalized["raw_date"], normalized["title"]
        )
        task = Task(
            id=f"task-{row_number}-{slug(normalized['title'])}",
            row_number=row_number,
            title=normalized["title"],
            description=normalized["description"],
            department=normalize_department(normalized["department"]),
            owner=normalized["owner"],
            collaborators=normalized["collaborators"],
            notes=normalized["notes"],
            reviewer=normalized["reviewer"],
            start_date=start_date,
            end_date=end_date,
            date_label=date_label,
            time_note=time_note,
            has_confirmed_date=has_confirmed_date,
            needs_date_confirmation=not has_confirmed_date,
            phase=get_phase(end_date),
            status_hint="",
            risk_level="",
            days_to_deadline=days_to_deadline(end_date),
        )
        task.status_hint = get_status_hint(task.start_date, task.end_date)
        task.risk_level = get_risk_level(task)
        tasks.append(task)
    return tasks


def summarize(tasks: list[Task]) -> dict:
    confirmed = [task for task in tasks if task.has_confirmed_date]
    overdue = [task for task in tasks if task.status_hint == "已逾期"]
    due_this_week = [
        task for task in tasks if task.end_date and 0 <= (date.fromisoformat(task.end_date) - TODAY).days <= 7
    ]
    high_risk = [task for task in tasks if task.risk_level == "高"]
    department_counts: dict[str, int] = {}
    phase_counts: dict[str, int] = {}
    for task in tasks:
        department_counts[task.department or "待补部门"] = department_counts.get(task.department or "待补部门", 0) + 1
        phase_counts[task.phase] = phase_counts.get(task.phase, 0) + 1

    timeline = []
    if confirmed:
        min_date = min(date.fromisoformat(task.start_date or task.end_date) for task in confirmed)
        max_date = max(date.fromisoformat(task.end_date) for task in confirmed)
        cursor = min_date
        while cursor <= max_date:
            count = sum(
                1
                for task in confirmed
                if date.fromisoformat(task.start_date or task.end_date) <= cursor <= date.fromisoformat(task.end_date)
            )
            timeline.append({"date": cursor.isoformat(), "activeTasks": count})
            cursor += timedelta(days=1)

    return {
        "projectName": "南京德基新店开业总控驾驶舱",
        "sourceName": SOURCE_CSV.name,
        "today": TODAY.isoformat(),
        "openingDay": OPENING_DAY.isoformat(),
        "countdownDays": (OPENING_DAY - TODAY).days,
        "projectSpanDays": (OPENING_DAY - PROJECT_START).days + 1,
        "kpis": {
            "taskCount": len(tasks),
            "datedTaskCount": len(confirmed),
            "missingDateCount": len(tasks) - len(confirmed),
            "overdueCount": len(overdue),
            "dueThisWeekCount": len(due_this_week),
            "highRiskCount": len(high_risk),
        },
        "departmentCounts": department_counts,
        "phaseCounts": phase_counts,
        "timeline": timeline,
        "tasks": [asdict(task) for task in tasks],
    }


def main() -> None:
    tasks = build_tasks()
    payload = summarize(tasks)
    OUTPUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_JS.write_text(
        "window.__DEJI_DATA__ = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Built {len(tasks)} tasks into {OUTPUT_JSON}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Linux /proc sample of an installed Base process and its WebKit descendants.

Usage: python scripts/profile_desktop.py PID --seconds 30
Run after startup settles, with no builds running; redirect JSON to a report.
This measures CPU/RSS/PSS, not GPU energy, battery life or frame rate.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import time


def processes():
    found = {}
    for path in Path('/proc').glob('[0-9]*/stat'):
        try:
            raw = path.read_text()
            fields = raw[raw.rindex(')') + 2:].split()
            found[int(path.parent.name)] = (int(fields[1]), int(fields[11]) + int(fields[12]))
        except (OSError, ValueError, IndexError):
            continue
    return found


def snapshot(root):
    found = processes()
    selected = {root}
    while True:
        expanded = selected | {pid for pid, (parent, _) in found.items() if parent in selected}
        if expanded == selected:
            break
        selected = expanded
    ticks = {pid: found[pid][1] for pid in selected if pid in found}
    memory = {'rss_mib': 0.0, 'pss_mib': 0.0}
    for pid in ticks:
        try:
            for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines():
                name, _, value = line.partition(':')
                if name in ('Rss', 'Pss'):
                    memory['rss_mib' if name == 'Rss' else 'pss_mib'] += int(value.split()[0]) / 1024
        except OSError as error:
            raise RuntimeError(f'Cannot measure process {pid}: {error}') from error
    return ticks, {key: round(value, 2) for key, value in memory.items()}


if __name__ == '__main__':
    if sys.platform != 'linux':
        raise SystemExit('This profiler requires Linux /proc. Use Instruments/Activity Monitor on macOS.')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pid', type=int)
    parser.add_argument('--seconds', type=float, default=30)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 60:
        parser.error('Choose a sample between 1 and 60 seconds.')
    before, memory_before = snapshot(args.pid)
    start = time.monotonic()
    time.sleep(args.seconds)
    elapsed = time.monotonic() - start
    after, memory_after = snapshot(args.pid)
    stable = before.keys() == after.keys() and args.pid in after
    delta = sum(after[pid] - before.get(pid, after[pid]) for pid in after)
    print(json.dumps({'duration_seconds': round(elapsed, 3),
                      'cpu_percent_one_core': round(delta / os.sysconf('SC_CLK_TCK') / elapsed * 100, 3),
                      'processes': sorted(after), 'process_set_stable': stable,
                      'memory_before': memory_before, 'memory_after': memory_after}, indent=2))
    if not stable:
        raise SystemExit('Process tree changed: CPU sample is incomplete; repeat after startup settles.')

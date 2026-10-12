//! Protocol 2, matching packages/sync/src/protocol.ts. Shared golden tests keep
//! native and cloud merge behavior aligned; opaque fields are never normalized.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Segment {
    Key(String),
    Record { id: String },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Slot {
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
}
impl Slot {
    pub fn absent() -> Self {
        Self {
            exists: false,
            value: None,
        }
    }
    pub fn present(v: Value) -> Self {
        Self {
            exists: true,
            value: Some(v),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub base_revision: i64,
    pub path: Vec<Segment>,
    pub action: String,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub requires_review: bool,
    pub before: Slot,
    pub after: Slot,
}
pub const ROOTS: &[&str] = &[
    "tasks",
    "calendarEvents",
    "focusSessions",
    "incomeEntries",
    "subscriptions",
    "habits",
    "habitLogs",
    "dailyRevenueTarget",
    "projects",
    "projectNotes",
    "projectLinks",
    "wallets",
    "portfolioSnapshots",
    "milestones",
    "projectDocuments",
    "projectFiles",
    "exams",
    "timetable",
    "schoolNotes",
    "playerSkills",
    "goals",
    "bodyMetrics",
    "workouts",
    "socialStats",
    "businessKPIs",
    "briefs",
    "boards",
    "boardItems",
    "boardDrawings",
    "wikiPages",
    "wikiFolders",
    "profile",
    "aiSettings",
    "courses",
    "newsPrefs",
    "autonomySettings",
    "shoppingList",
    "bookmarks",
    "readingList",
    "watchList",
    "navPrefs",
];
fn safe(v: &Value, depth: usize) -> bool {
    if depth > 64 {
        return false;
    }
    match v {
        Value::Array(a) => a.iter().all(|v| safe(v, depth + 1)),
        Value::Object(o) => o.iter().all(|(k, v)| {
            !matches!(k.as_str(), "__proto__" | "prototype" | "constructor") && safe(v, depth + 1)
        }),
        _ => true,
    }
}
pub fn validate(op: &Operation) -> bool {
    let root = matches!(op.path.first(),Some(Segment::Key(k)) if ROOTS.contains(&k.as_str()));
    root && !op.id.is_empty()
        && op.id.len() <= 100
        && op
            .id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        && op.base_revision >= 0
        && op.path.len() <= 32
        && op.path.iter().all(|s| match s {
            Segment::Key(k) => {
                !k.is_empty()
                    && k.len() <= 200
                    && !matches!(k.as_str(), "__proto__" | "constructor" | "prototype")
            }
            Segment::Record { id } => !id.is_empty() && id.len() <= 200,
        })
        && [&op.before, &op.after]
            .iter()
            .all(|s| !s.exists || s.value.as_ref().is_some_and(|v| safe(v, 0)))
        && match op.action.as_str() {
            "order" => [&op.before, &op.after].iter().all(|s| {
                s.exists
                    && s.value.as_ref().and_then(Value::as_array).is_some_and(|a| {
                        a.iter().all(Value::is_string)
                            && a.iter().collect::<std::collections::HashSet<_>>().len() == a.len()
                    })
            }),
            "set" => {
                !(op.path.len() > 1 && matches!(op.path.last(),Some(Segment::Key(k)) if k=="id"))
                    && match op.path.last() {
                        Some(Segment::Record { id }) if op.after.exists => op
                            .after
                            .value
                            .as_ref()
                            .is_some_and(|v| v.is_object() && v["id"].as_str() == Some(id)),
                        _ => true,
                    }
            }
            _ => false,
        }
}
pub fn read(doc: &Value, path: &[Segment], order: bool) -> Slot {
    let mut current = doc;
    for s in path {
        current = match s {
            Segment::Key(k) => match current.as_object().and_then(|o| o.get(k)) {
                Some(v) => v,
                None => return Slot::absent(),
            },
            Segment::Record { id } => match current
                .as_array()
                .and_then(|a| a.iter().find(|v| v["id"].as_str() == Some(id)))
            {
                Some(v) => v,
                None => return Slot::absent(),
            },
        };
    }
    if order {
        return current
            .as_array()
            .map(|a| {
                Slot::present(Value::Array(
                    a.iter()
                        .filter(|v| v.is_object())
                        .map(|v| v["id"].clone())
                        .collect(),
                ))
            })
            .unwrap_or_else(Slot::absent);
    }
    Slot::present(current.clone())
}
fn descend<'a>(
    parent: &'a mut Value,
    path: &[Segment],
    before_exists: bool,
) -> Option<&'a mut Value> {
    if path.len() <= 1 {
        return Some(parent);
    }
    let next = match &path[0] {
        Segment::Key(k) => {
            let obj = parent.as_object_mut()?;
            if !obj.contains_key(k) {
                if before_exists {
                    return None;
                }
                obj.insert(
                    k.clone(),
                    if matches!(path.get(1), Some(Segment::Record { .. })) {
                        json!([])
                    } else {
                        json!({})
                    },
                );
            }
            obj.get_mut(k)?
        }
        Segment::Record { id } => parent
            .as_array_mut()?
            .iter_mut()
            .find(|v| v["id"].as_str() == Some(id))?,
    };
    descend(next, &path[1..], before_exists)
}
pub fn write(doc: &Value, op: &Operation) -> Option<Value> {
    let mut next = doc.clone();
    if op.action == "order" {
        let slot = read(doc, &op.path, false);
        let rows = slot.value?.as_array()?.clone();
        let ids = op.after.value.as_ref()?.as_array()?;
        let mut ordered = Vec::new();
        for id in ids {
            ordered.extend(
                rows.iter()
                    .filter(|v| v.is_object() && v["id"] == *id)
                    .cloned(),
            );
        }
        ordered.extend(
            rows.into_iter()
                .filter(|v| !v.is_object() || !ids.contains(&v["id"])),
        );
        let mut set = op.clone();
        set.action = "set".into();
        set.after = Slot::present(Value::Array(ordered));
        return write(doc, &set);
    }
    let parent = descend(&mut next, &op.path, op.before.exists)?;
    match op.path.last()? {
        Segment::Key(k) => {
            let obj = parent.as_object_mut()?;
            if op.after.exists {
                obj.insert(k.clone(), op.after.value.clone()?);
            } else {
                obj.remove(k);
            }
        }
        Segment::Record { id } => {
            let rows = parent.as_array_mut()?;
            let index = rows.iter().position(|v| v["id"].as_str() == Some(id));
            if !op.after.exists {
                if let Some(i) = index {
                    rows.remove(i);
                }
            } else if let Some(i) = index {
                rows[i] = op.after.value.clone()?;
            } else {
                rows.push(op.after.value.clone()?);
            }
        }
    }
    Some(next)
}
pub fn protected(doc: &Value, op: &Operation) -> bool {
    if matches!(op.path.first(),Some(Segment::Key(k)) if k=="autonomySettings") {
        return true;
    }
    if !matches!(op.path.first(),Some(Segment::Key(k)) if k=="tasks") {
        return false;
    }
    // Existing autonomy records retain their server-managed execution fields.
    let autonomy = |v: &Value| {
        v["tag"] == "night-auto"
            || v["tag"] == "@night-auto"
            || v["nightPolicy"] == "autonomous-v1"
            || v["executionState"].as_str().is_some_and(|state| {
                [
                    "suggested",
                    "queued",
                    "in_progress",
                    "awaiting_review",
                    "needs_input",
                    "blocked",
                    "completed",
                    "rejected",
                ]
                .contains(&state)
            })
    };
    if op.path.len() == 1 {
        return doc["tasks"]
            .as_array()
            .is_some_and(|a| a.iter().any(autonomy));
    }
    let task = read(doc, &op.path[..2], false).value.unwrap_or(Value::Null);
    autonomy(&task)
        && (op.path.len() == 2
            || matches!(op.path.get(2),Some(Segment::Key(k)) if ["done","completedAt","executionState","executionId","executionStartedAt","executionFinishedAt","executionLeaseUntil","leaseUntil","executionOwner","startedAt","approvedAt","lastLeaseExpiredAt","lastExecutionStartedAt","requeuedAt","executionAgent","workerModel","executionEvidence","resultSummary","resultNoteId","nightExecutedAt","verificationStatus","verifiedAt","correctionAttempts","implementationApproved","blockedReason"].contains(&k.as_str())))
}
pub fn merge(
    doc: &Value,
    op: &Operation,
    revision: i64,
    tombstoned: bool,
) -> (Value, Option<Value>) {
    let remote = read(doc, &op.path, op.action == "order");
    let reason = if protected(doc, op) {
        Some("protected-field")
    } else if tombstoned && op.after.exists {
        Some("tombstone")
    } else if (op.requires_review && remote != op.after)
        || (remote != op.before && remote != op.after)
    {
        Some("concurrent-edit")
    } else {
        None
    };
    let written = if reason.is_none() {
        write(doc, op)
    } else {
        None
    };
    match written {
        Some(next) => (next, None),
        None => (
            doc.clone(),
            Some(
                json!({"id":op.id,"operation":op,"remote":remote,"revision":revision,"reason":reason.unwrap_or("deleted-parent")}),
            ),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn edit(before: &str, after: &str) -> Operation {
        serde_json::from_value(json!({"id":"edit-1","baseRevision":0,"path":["tasks",{"id":"t"},"title"],"action":"set","before":{"exists":true,"value":before},"after":{"exists":true,"value":after}})).unwrap()
    }
    #[test]
    fn concurrent_edits_preserve_remote_and_unknown() {
        let doc = json!({"tasks":[{"id":"t","title":"remote","future":1}],"opaque":{"keep":true}});
        let (next, conflict) = merge(&doc, &edit("old", "local"), 2, false);
        assert_eq!(next, doc);
        assert_eq!(conflict.unwrap()["reason"], "concurrent-edit");
    }
    #[test]
    fn independent_field_edit_preserves_unknown() {
        let doc = json!({"tasks":[{"id":"t","title":"old","future":1}]});
        let (next, c) = merge(&doc, &edit("old", "local"), 1, false);
        assert!(c.is_none());
        assert_eq!(next["tasks"][0]["future"], 1);
        assert_eq!(next["tasks"][0]["title"], "local");
    }
    #[test]
    fn a_deleted_parent_is_not_resurrected() {
        let (_, c) = merge(&json!({"tasks":[]}), &edit("old", "local"), 1, false);
        assert!(c.is_some());
    }
    #[test]
    fn identities_and_unsafe_paths_are_rejected() {
        let mut op = edit("old", "new");
        assert!(validate(&op));
        op.path.push(Segment::Key("__proto__".into()));
        assert!(!validate(&op));
    }
}

#[cfg(target_os = "linux")]
#[test]
fn variant_string_iterator_uses_mutable_out_pointer() {
    use glib::variant::ToVariant;
    let value = ["first", "second", "third"].to_variant();
    assert_eq!(
        value.array_iter_str().unwrap().collect::<Vec<_>>(),
        ["first", "second", "third"]
    );
    assert_eq!(value.array_iter_str().unwrap().next_back(), Some("third"));
    assert_eq!(value.array_iter_str().unwrap().nth(1), Some("second"));
    assert_eq!(value.array_iter_str().unwrap().nth_back(1), Some("second"));
    assert_eq!(value.array_iter_str().unwrap().last(), Some("third"));
}

#[cfg(target_os = "linux")]
#[test]
fn updater_zip_dependency_confines_symlinks_and_strips_privileged_permissions() {
    use std::{fs, io::Cursor, os::unix::fs::PermissionsExt};
    use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};
    let root = std::env::temp_dir().join(format!("base-zip-security-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let outside = root.join("outside.txt");
    fs::write(&outside, "retained").unwrap();
    fs::set_permissions(&outside, fs::Permissions::from_mode(0o600)).unwrap();
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    writer
        .add_symlink(
            "escape",
            outside.to_str().unwrap(),
            SimpleFileOptions::default().unix_permissions(0o777),
        )
        .unwrap();
    let archive = writer.finish().unwrap().into_inner();
    assert!(ZipArchive::new(Cursor::new(archive))
        .unwrap()
        .extract(root.join("output"))
        .is_err());
    assert_eq!(fs::read_to_string(&outside).unwrap(), "retained");
    assert_eq!(
        fs::metadata(&outside).unwrap().permissions().mode() & 0o7777,
        0o600
    );

    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    writer
        .start_file(
            "ordinary",
            SimpleFileOptions::default().unix_permissions(0o6755),
        )
        .unwrap();
    let archive = writer.finish().unwrap().into_inner();
    ZipArchive::new(Cursor::new(archive))
        .unwrap()
        .extract(root.join("safe"))
        .unwrap();
    assert_eq!(
        fs::metadata(root.join("safe/ordinary"))
            .unwrap()
            .permissions()
            .mode()
            & 0o6000,
        0
    );
    fs::remove_dir_all(root).unwrap();
}

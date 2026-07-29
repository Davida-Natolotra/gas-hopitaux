use std::sync::Arc;

use arrow::array::{Array, StringArray};
use arrow::datatypes::{DataType, Field, Schema};
use arrow::record_batch::RecordBatch;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use parquet::arrow::ArrowWriter;
use serde::Deserialize;
use serde_json::Value;

/// Raw rows for each source table, gathered on the JS side (which already
/// knows how to query them) and handed over as-is; each ends up as one
/// JSON-array-string column in the exported file (see export_utglfs below).
#[derive(Deserialize)]
pub struct UtglfsExportPayload {
    my_produitprogrammeniveau: Vec<Value>,
    my_organisation_unit: Vec<Value>,
    user_fs: Vec<Value>,
    rapportfs: Vec<Value>,
    rapportfs_ligne: Vec<Value>,
}

/// Builds a single-row, 5-column Parquet file in memory — one column per
/// source table, each holding that table's rows serialized as a JSON array
/// string — and returns it base64-encoded. A real Parquet file is produced;
/// `.utglfs` is just the extension the caller chooses to save it under.
///
/// This deliberately does NOT write to a path itself: on Android/iOS, the
/// destination the user picks via the save dialog is a content:// SAF URI,
/// not a real filesystem path, and plain std::fs can't write to that. The
/// caller writes the returned bytes with `@tauri-apps/plugin-fs`'s
/// `writeFile`, which knows how to handle both real paths and SAF URIs.
///
/// Parquet requires one fixed schema for the whole file, so this is the only
/// way to carry 5 differently-shaped, independently-sized tables in a single
/// file: one row, one JSON blob per table, rather than genuine per-table row
/// structure.
#[tauri::command]
pub fn export_utglfs(payload: UtglfsExportPayload) -> Result<String, String> {
    let named_rows: [(&str, &Vec<Value>); 5] = [
        ("my_produitprogrammeniveau", &payload.my_produitprogrammeniveau),
        ("my_organisation_unit", &payload.my_organisation_unit),
        ("user_fs", &payload.user_fs),
        ("rapportfs", &payload.rapportfs),
        ("rapportfs_ligne", &payload.rapportfs_ligne),
    ];

    let fields: Vec<Field> = named_rows
        .iter()
        .map(|(name, _)| Field::new(*name, DataType::Utf8, false))
        .collect();
    let schema = Arc::new(Schema::new(fields));

    let mut columns: Vec<Arc<dyn Array>> = Vec::with_capacity(named_rows.len());
    for (_, rows) in named_rows.iter() {
        let json = serde_json::to_string(rows).map_err(|e| e.to_string())?;
        columns.push(Arc::new(StringArray::from(vec![json])));
    }

    let batch = RecordBatch::try_new(schema.clone(), columns).map_err(|e| e.to_string())?;

    let mut buffer: Vec<u8> = Vec::new();
    {
        let mut writer = ArrowWriter::try_new(&mut buffer, schema, None).map_err(|e| e.to_string())?;
        writer.write(&batch).map_err(|e| e.to_string())?;
        writer.close().map_err(|e| e.to_string())?;
    }

    Ok(BASE64.encode(&buffer))
}

#[cfg(test)]
mod tests {
    use super::*;
    use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
    use serde_json::json;

    #[test]
    fn produces_a_readable_single_row_parquet_payload() {
        let payload = UtglfsExportPayload {
            my_produitprogrammeniveau: vec![json!({"id": "ppn-1", "produit_id": 5})],
            my_organisation_unit: vec![json!({"id": 1, "fs_id": "fs-001"})],
            user_fs: vec![json!({"id": "u-1", "username": "alice"})],
            rapportfs: vec![json!({"id": "r-1", "mois_annee": "2026-06"})],
            rapportfs_ligne: vec![json!({
                "id": "l-1",
                "rapportfs_id": "r-1",
                "detail_sdu": [{"id": "d-1", "sdu": 3}],
            })],
        };

        let encoded = export_utglfs(payload).expect("export_utglfs should succeed");
        let bytes = BASE64.decode(&encoded).expect("result should be valid base64");

        let reader = ParquetRecordBatchReaderBuilder::try_new(bytes::Bytes::from(bytes))
            .expect("bytes should be valid parquet")
            .build()
            .expect("should build a record batch reader");

        let batches: Vec<RecordBatch> = reader.collect::<Result<_, _>>().expect("should read all batches");
        assert_eq!(batches.len(), 1);
        let batch = &batches[0];
        assert_eq!(batch.num_rows(), 1);
        assert_eq!(
            batch.schema().fields().iter().map(|f| f.name().clone()).collect::<Vec<_>>(),
            vec![
                "my_produitprogrammeniveau",
                "my_organisation_unit",
                "user_fs",
                "rapportfs",
                "rapportfs_ligne",
            ]
        );

        let ligne_col = batch
            .column_by_name("rapportfs_ligne")
            .expect("rapportfs_ligne column should exist")
            .as_any()
            .downcast_ref::<StringArray>()
            .expect("column should be a Utf8 array");
        let parsed: Vec<Value> = serde_json::from_str(ligne_col.value(0)).expect("column should round-trip as JSON");
        assert_eq!(parsed[0]["detail_sdu"][0]["sdu"], 3);
    }
}

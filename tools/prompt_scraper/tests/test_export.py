import csv
import os
import tempfile
import pytest
from unittest.mock import MagicMock, patch
from export import transform_prompt, assemble_row, export_batch
import db

MOCK_TRANSFORMED = {
    "concept": "Centered graphic design, vintage badge: mountain silhouette with pine trees",
    "colorPalette": "forest green, cream, rust orange",
    "title": "National Park Vintage Badge Tee",
}

def make_mock_openai(response_json: dict):
    mock_client = MagicMock()
    mock_msg = MagicMock()
    mock_msg.content = __import__("json").dumps(response_json)
    mock_client.chat.completions.create.return_value.choices = [
        MagicMock(message=mock_msg)
    ]
    return mock_client

def test_transform_prompt_calls_gpt():
    client = make_mock_openai(MOCK_TRANSFORMED)
    result = transform_prompt(
        client,
        raw_prompt="mountain badge illustration",
        niche="hiking",
        style_tag="vintage-badge",
        color_hints="green, brown",
        product_category="shirt",
    )
    assert result["concept"].startswith("Centered graphic design")
    assert "forest green" in result["colorPalette"]
    assert client.chat.completions.create.called

def test_transform_prompt_uses_gpt_4_1_mini():
    client = make_mock_openai(MOCK_TRANSFORMED)
    transform_prompt(client, "prompt", "hiking", "vintage-badge", None, "shirt")
    call_kwargs = client.chat.completions.create.call_args
    assert call_kwargs.kwargs["model"] == "gpt-4.1-mini"

def test_assemble_row_has_20_columns():
    row = assemble_row(
        sheet_id=62,
        niche="hiking",
        style_tag="vintage-badge",
        product_category="shirt",
        priority="medium",
        source="civitai",
        transformed=MOCK_TRANSFORMED,
    )
    EXPECTED_KEYS = {
        "id", "rowId", "title", "niche", "concept", "styleTag", "colorPalette",
        "product_category", "size", "priority", "live-mode", "n8n_status",
        "n8n_error", "assetIds", "imageUrl", "firebaseProductId",
        "published", "lastRun", "retryCount", "notes"
    }
    assert set(row.keys()) == EXPECTED_KEYS

def test_assemble_row_fixed_fields():
    row = assemble_row(62, "hiking", "vintage-badge", "shirt", "medium", "civitai", MOCK_TRANSFORMED)
    assert row["id"] == 62
    assert row["rowId"] == 63
    assert row["size"] == "1024x1024"
    assert row["live-mode"] == "FALSE"
    assert row["n8n_status"] == ""
    assert row["retryCount"] == "0"

def test_export_batch_writes_csv(conn):
    db.insert_prompt(
        conn, source="civitai", source_id="x1",
        source_url="", raw_prompt="mountain badge",
        tags='["badge","mountain"]', niche="hiking",
        style_tag="vintage-badge", color_hints="green",
        product_category="shirt", popularity=50
    )
    with patch("export.OpenAI") as MockOpenAI:
        MockOpenAI.return_value = make_mock_openai(MOCK_TRANSFORMED)
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w") as f:
            out_path = f.name
        try:
            result_path = export_batch(conn, count=1, out=out_path, start_id=62)
            assert os.path.exists(result_path)
            with open(result_path) as f:
                rows = list(csv.DictReader(f))
            assert len(rows) == 1
            assert rows[0]["id"] == "62"
            assert rows[0]["live-mode"] == "FALSE"
        finally:
            os.unlink(out_path)

def test_export_batch_marks_used(conn):
    db.insert_prompt(
        conn, source="civitai", source_id="y1",
        source_url="", raw_prompt="dog pixel art",
        tags='["dog","pixel"]', niche="dogs",
        style_tag="retro-pixel", color_hints=None,
        product_category="shirt", popularity=30
    )
    with patch("export.OpenAI") as MockOpenAI:
        MockOpenAI.return_value = make_mock_openai(MOCK_TRANSFORMED)
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            out_path = f.name
        try:
            export_batch(conn, count=1, out=out_path, start_id=62)
            unused = db.get_unused_prompts(conn, limit=10)
            assert len(unused) == 0
        finally:
            os.unlink(out_path)

def test_export_batch_empty_db_raises(conn):
    with patch("export.OpenAI"):
        with pytest.raises(ValueError, match="No matching prompts"):
            export_batch(conn, count=10, out="dummy.csv", start_id=62)

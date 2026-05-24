import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import tempfile
from db import get_conn, init_db

@pytest.fixture
def conn():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    c = get_conn(db_path)
    init_db(c)
    yield c
    c.close()
    os.unlink(db_path)

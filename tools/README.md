# Tools

Deterministic Python scripts that do the actual work — API calls, data
transforms, file ops, DB queries. The agent calls these; it does not improvise
their job.

## Conventions

- **Single responsibility.** One script does one well-defined thing.
- **CLI-runnable.** Each tool should run standalone, e.g.
  `python tools/scrape_single_site.py --url https://example.com`.
- **Read secrets via `config.py`**, never hardcode them.
- **Write intermediates to `.tmp/`** using `config.tmp_path("name")`.
- **Fail loud.** Validate inputs, raise clear errors, exit non-zero on failure.
- **Print machine-readable output** (JSON or a file path) so the agent can chain steps.

## Template

```python
import argparse, json
from config import tmp_path  # add get_env if you need secrets

def main(url: str) -> dict:
    ...  # do the work
    return {"status": "ok"}

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True)
    args = p.parse_args()
    print(json.dumps(main(args.url)))
```

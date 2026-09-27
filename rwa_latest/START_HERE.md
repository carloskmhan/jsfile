# Start here

New full project: read README.md and TABLEAU_SETUP.md. Use tableau_config.txt for sample mode; merge real values from tableau_config.live.example.txt only after review. The two-sheet live integration needs the full v6 runtime, not only a TXT replacement.

Local rule management: `python rule_manager.py` → http://127.0.0.1:8765/. Seven language CSVs, no customer alias master.

Local app preview: `python -m http.server 8000 --bind 127.0.0.1` → http://127.0.0.1:8000/demo.html. Do not expose the full source directory externally. Self-contained synthetic demo: standalone_demo.html.

The optional data_builder/build_tableau_csv.py is unchanged v1.0.8. Keep your working source CSV mapping. This app reads its JSON, preserves raw group/LEID identities, and labels the derived prior basis.

# wayback_machine_downloader
download archived website content from the Wayback Machine
Run the server using:

1) run

node app.js

2) Access the server in your browser or via curl:

bash

    curl "http://localhost:3000/download?url=http://example.com"

This will download the snapshots of the specified URL and save them in the backups directory within your project.

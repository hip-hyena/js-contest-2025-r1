# Set default destination path if not provided as parameter
$destPath = if ($args[0]) { $args[0] } else { "dist" }

# Copy public folder contents recursively
Copy-Item -Path ".\public\*" -Destination $destPath -Recurse -Force

# Copy rlottie wasm file
Copy-Item -Path ".\src\lib\rlottie\rlottie-wasm.wasm" -Destination $destPath -Force

# Copy opus decoder wasm file
Copy-Item -Path ".\node_modules\opus-recorder\dist\decoderWorker.min.wasm" -Destination $destPath -Force

# Copy emoji data folders
Copy-Item -Path ".\node_modules\emoji-data-ios\img-apple-64" -Destination $destPath -Recurse -Force
Copy-Item -Path ".\node_modules\emoji-data-ios\img-apple-160" -Destination $destPath -Recurse -Force
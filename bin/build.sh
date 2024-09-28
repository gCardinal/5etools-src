if [ ! -d "img" ]; then
  git clone https://github.com/5etools-mirror-3/5etools-img.git img
else
  cd img || exit
  git pull
  cd ..
fi
npm run build:sw:prod

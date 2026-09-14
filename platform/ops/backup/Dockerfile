FROM alpine:3.20
RUN apk add --no-cache postgresql16-client rclone bash tzdata coreutils
COPY backup.sh restore.sh loop.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/loop.sh \
  && mkdir -p /root/.config/rclone && touch /root/.config/rclone/rclone.conf
VOLUME ["/backups"]
ENTRYPOINT ["loop.sh"]

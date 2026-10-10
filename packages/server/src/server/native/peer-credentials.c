#include <node_api.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>
#include <sys/types.h>
#include <unistd.h>

static napi_value read_peer(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1], value; int32_t fd;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_int32(env, args[0], &fd) != napi_ok || fd < 0) {
    napi_throw_error(env, NULL, "Invalid socket descriptor"); return NULL;
  }
  struct sockaddr_storage address; socklen_t length = sizeof(address);
  uid_t uid; gid_t gid;
  if (getpeername(fd, (struct sockaddr *)&address, &length) != 0 ||
      address.ss_family != AF_UNIX || getpeereid(fd, &uid, &gid) != 0) {
    napi_throw_error(env, NULL, "Unix peer credentials unavailable"); return NULL;
  }
  napi_create_uint32(env, uid, &value); return value;
}
static napi_value create_listener(napi_env env, napi_callback_info info) {
  size_t count = 1, length; napi_value args[1], value; struct sockaddr_un address;
  memset(&address, 0, sizeof(address)); address.sun_family = AF_UNIX;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_string_utf8(env, args[0], address.sun_path, sizeof(address.sun_path), &length) != napi_ok || length == 0 || length >= sizeof(address.sun_path) - 1 || length != strlen(address.sun_path)) {
    napi_throw_error(env, NULL, "Invalid Unix path"); return NULL;
  }
  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0 || fcntl(fd, F_SETFD, FD_CLOEXEC) != 0 || bind(fd, (struct sockaddr *)&address, sizeof(address)) != 0) {
    if (fd >= 0) close(fd); napi_throw_error(env, NULL, "Unix socket bind unavailable"); return NULL;
  }
  // Node adopts an FD without a pathname, so libuv cannot unlink another
  // process's replacement endpoint on close. JS owns inode-checked cleanup.
  napi_create_int32(env, fd, &value); return value;
}
// Resource release stays at the native ownership boundary: do not yield to JS
// between checking the identity and closing/unlinking a potentially reused value.
static int read_identity(napi_env env, napi_value dev, napi_value ino, int64_t *d, uint64_t *i) {
  bool dev_exact, ino_exact;
  return napi_get_value_bigint_int64(env, dev, d, &dev_exact) == napi_ok && dev_exact &&
    napi_get_value_bigint_uint64(env, ino, i, &ino_exact) == napi_ok && ino_exact;
}
static napi_value close_listener(napi_env env, napi_callback_info info) {
  size_t count = 3; napi_value args[3], result; int32_t fd; int64_t dev; uint64_t ino;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok ||
      (count != 1 && count != 3) || napi_get_value_int32(env, args[0], &fd) != napi_ok || fd < 0 ||
      (count == 3 && !read_identity(env, args[1], args[2], &dev, &ino))) {
    napi_throw_error(env, NULL, "Invalid listener identity"); return NULL;
  }
  napi_get_undefined(env, &result);
  if (count == 3) {
    struct stat current;
    if (fstat(fd, &current) != 0) {
      if (errno == EBADF) return result;
      napi_throw_error(env, NULL, "Listener descriptor check failed"); return NULL;
    }
    if ((int64_t)current.st_dev != dev || (uint64_t)current.st_ino != ino) return result;
  }
  if (close(fd) != 0) {
    napi_throw_error(env, NULL, "Listener descriptor close failed"); return NULL;
  }
  return result;
}
static napi_value unlink_listener(napi_env env, napi_callback_info info) {
  size_t count = 3, length; napi_value args[3], result; char path[sizeof(((struct sockaddr_un *)0)->sun_path)];
  int64_t dev; uint64_t ino; struct stat current;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 3 ||
      napi_get_value_string_utf8(env, args[0], path, sizeof(path), &length) != napi_ok ||
      length == 0 || length >= sizeof(path) - 1 || length != strlen(path) ||
      !read_identity(env, args[1], args[2], &dev, &ino)) {
    napi_throw_error(env, NULL, "Invalid endpoint identity"); return NULL;
  }
  napi_get_undefined(env, &result);
  if (lstat(path, &current) != 0) {
    if (errno == ENOENT) return result;
    napi_throw_error(env, NULL, "Listener endpoint check failed"); return NULL;
  }
  if (S_ISSOCK(current.st_mode) && (int64_t)current.st_dev == dev && (uint64_t)current.st_ino == ino && unlink(path) != 0) {
    napi_throw_error(env, NULL, "Listener endpoint unlink failed"); return NULL;
  }
  return result;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_value fn; napi_create_function(env, "peerUid", NAPI_AUTO_LENGTH, read_peer, NULL, &fn);
  napi_set_named_property(env, exports, "peerUid", fn);
  napi_create_function(env, "createListener", NAPI_AUTO_LENGTH, create_listener, NULL, &fn);
  napi_set_named_property(env, exports, "createListener", fn);
  napi_create_function(env, "closeListener", NAPI_AUTO_LENGTH, close_listener, NULL, &fn);
  napi_set_named_property(env, exports, "closeListener", fn);
  napi_create_function(env, "unlinkListener", NAPI_AUTO_LENGTH, unlink_listener, NULL, &fn);
  napi_set_named_property(env, exports, "unlinkListener", fn); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)

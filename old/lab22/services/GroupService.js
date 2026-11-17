'use strict';

const { GroupDAO } = require('../dao/GroupDAO');
const { StudentDAO } = require('../dao/StudentDAO');
const { NotFoundError } = require('../lib/appErrors');
const { parseListOptions, parseId } = require('../models/student');

class GroupService {
  constructor({ cache, logger, groupDaoFactory = (db) => new GroupDAO(db), studentDaoFactory = (db) => new StudentDAO(db) }) {
    this.cache = cache;
    this.logger = logger;
    this.groups = groupDaoFactory;
    this.students = studentDaoFactory;
  }

  async _cached(key, loader) {
    const hit = this.cache.get(key);
    if (hit !== undefined) return { value: hit, cacheHit: true };
    const value = await loader();
    this.cache.set(key, value);
    return { value, cacheHit: false };
  }

  async list(db) {
    return this._cached('groups:list', async () => ({ data: await this.groups(db).list() }));
  }

  async create(db, data) {
    const group = await this.groups(db).create(data);
    this.cache.clear();
    this.logger.op('CACHE INVALIDATE (create group)');
    return group;
  }

  /** Студенты группы: сначала находим группу по id (404, если нет), затем фильтр по её названию. */
  async studentsOf(db, id, query) {
    const groupId = parseId(id);
    const group = await this.groups(db).findById(groupId);
    if (!group) throw new NotFoundError(`Группа ${groupId} не найдена`);
    const opts = parseListOptions({ ...query, group_name: group.name });
    return this._cached(`groups:${groupId}:students:${JSON.stringify(opts)}`, async () => ({
      group: { id: group.id, name: group.name, curator: group.curator },
      ...(await this.students(db).findAll(opts)),
    }));
  }
}

module.exports = { GroupService };

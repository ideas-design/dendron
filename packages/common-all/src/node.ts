/* eslint-disable no-loop-func */
import matter from "gray-matter";
import _ from "lodash";
import minimatch from "minimatch";
import moment from "moment";
import path from "path";
import { URI } from "vscode-uri";
import YAML from "yamljs";
import { DendronError } from "./error";
import {
  DEngine,
  DNodeData,
  DNodeDict,
  DNodeRawOpts,
  DNodeRawProps,
  IDNode,
  IDNodeOpts,
  IDNodeType,
  INote,
  INoteOpts,
  ISchema,
  ISchemaOpts,
  NoteData,
  NoteDict,
  NoteLink,
  NoteProps,
  NoteRawProps,
  RawPropsOpts,
  SchemaData,
  SchemaDict,
  SchemaRawOptsFlat,
  SchemaRawProps,
  SchemaTemplate,
} from "./types";
import { genUUID } from "./uuid";

export const UNKNOWN_SCHEMA_ID = "_UNKNOWN_SCHEMA";

export class DNodeUtils {
  /**
   * Last element of path
   *
   * // don't remove extension
   * basename(foo.bar.md) // foo.bar
   *
   * @param nodePath
   * @param rmExtension
   */
  static basename(nodePath: string, rmExtension?: boolean) {
    if (rmExtension) {
      const idx = nodePath.lastIndexOf(".md");
      if (idx > 0) {
        nodePath = nodePath.slice(0, idx);
      }
    }
    const [first, ...rest] = nodePath.split(".");
    return _.isEmpty(rest) ? first : rest.slice(-1)[0];
  }

  /**
   * Second last element
   * @param nodePath
   */
  static dirName(nodePath: string) {
    return nodePath.split(".").slice(0, -1).join(".");
  }

  /**
   * First element
   * eg. domainName(foo.bar.baz) // foo
   * @param nodePath
   */
  static domainName(nodePath: string) {
    return nodePath.split(".")[0];
  }

  static findParent(opts: {
    hpath: string;
    nodes: DNodeDict;
  }): DNode | undefined {
    const { hpath, nodes } = opts;
    const dirname = DNodeUtils.dirName(hpath);
    if (dirname === "") {
      return nodes["root"];
    }
    return _.find(nodes, { fname: dirname });
  }

  static findClosestParent(
    fpath: string,
    nodes: DNodeDict,
    opts?: { noStubs: boolean }
  ): IDNode {
    const cleanOpts = _.defaults(opts, { noStubs: false });
    const dirname = DNodeUtils.dirName(fpath);
    if (dirname === "") {
      return nodes["root"];
    }
    const maybeNode = _.find(nodes, { fname: dirname });
    // return if not a stub
    if (
      (maybeNode && cleanOpts.noStubs && !maybeNode?.stub) ||
      (maybeNode && !cleanOpts.noStubs)
    ) {
      return maybeNode;
    }
    return DNodeUtils.findClosestParent(dirname, nodes, cleanOpts);
  }

  /**
   *
   * @param note
   * - pullCustomUp: roll custom attributes to top level, default: false
   * @param opts
   */
  static getMeta(
    note: Note,
    opts?: { pullCustomUp?: boolean; ignoreNullParent?: boolean }
  ): any {
    const { pullCustomUp, ignoreNullParent } = _.defaults(opts || {}, {
      pullCustomUp: false,
      ignoreNullParent: false,
    });
    let seed = {};
    let fields = [
      "id",
      "title",
      "desc",
      "updated",
      "created",
      "data",
      "fname",
      "stub",
    ];
    if (pullCustomUp) {
      seed = note.custom;
      fields = _.reject(fields, (ent) => ent === "custom");
    }
    const meta = { ...seed, ..._.pick(note, [...fields]) };
    const family = _.pick(note.toRawProps(true, { ignoreNullParent }), [
      "parent",
      "children",
    ]);
    return { ...meta, ...family };
  }

  static getNoteByFname(
    fname: string,
    engine: DEngine,
    opts?: { throwIfEmpty: boolean }
  ): Note | undefined {
    const out = _.find(
      _.values(engine.notes),
      (ent) => ent.fname.toLowerCase() === fname
    );
    if (opts?.throwIfEmpty && _.isUndefined(out)) {
      throw Error(`${fname} not found`);
    }
    return out;
  }

  static getPathUpTo(hpath: string, numCompoenents: number) {
    return hpath.split(".").slice(0, numCompoenents).join(".");
  }

  static isRoot(node: DNode): boolean {
    return node.id === "root";
  }

  static uri2Fname(uri: URI) {
    return path.basename(uri.fsPath, ".md");
  }

  static node2Uri(node: Note, engine: DEngine): URI {
    return URI.file(path.join(engine.props.root, node.fname + ".md"));
  }
}

export type CreatePropsOpts = {
  returnExtra: boolean;
};

export class DNodeRaw {
  /**
   *
   * @param nodeOpts
   * @param opts
   *   - returnExtra: if true, return extra properties, default: false
   */
  static createProps<T>(
    nodeOpts: DNodeRawOpts<T>
  ): DNodeRawProps<T> & { extra?: any } {
    const {
      id,
      desc,
      fname,
      updated,
      created,
      parent,
      stub,
      children,
      body,
      data,
    } = _.defaults(nodeOpts, {
      updated: moment.now(),
      created: moment.now(),
      id: genUUID(),
      desc: "",
      children: [],
      stub: false,
      parent: null,
      body: "",
      data: {},
      fname: null,
    });
    const title = nodeOpts.title || DNode.defaultTitle(fname);
    const nodePropsItems = {
      id,
      title,
      desc,
      fname,
      updated,
      created,
      parent,
      children,
      stub,
      body,
      data,
    };
    const denylist = ["schemaStub", "type"];
    /**
     * Custom properties
     */
    const custom = _.omit(nodeOpts, _.keys(nodePropsItems).concat(denylist));
    const nodeProps: DNodeRawProps<T> & { extra?: any } = {
      ...nodePropsItems,
      custom,
    };
    return nodeProps;
  }
}

type QuickPickItem = {
  label: string;

  /**
   * A human-readable string which is rendered less prominent in the same line. Supports rendering of
   * [theme icons](#ThemeIcon) via the `$(<name>)`-syntax.
   */
  description?: string;

  /**
   * A human-readable string which is rendered less prominent in a separate line. Supports rendering of
   * [theme icons](#ThemeIcon) via the `$(<name>)`-syntax.
   */
  detail?: string;

  /**
   * Optional flag indicating if this item is picked initially.
   * (Only honored when the picker allows multiple selections.)
   *
   * @see [QuickPickOptions.canPickMany](#QuickPickOptions.canPickMany)
   */
  picked?: boolean;

  /**
   * Always show this item.
   */
  alwaysShow?: boolean;
};

export abstract class DNode<T = DNodeData> implements IDNode<T>, QuickPickItem {
  public id: string;
  public title: string;
  public desc: string;
  public fname: string;
  public type: IDNodeType;
  public updated: string;
  public created: string;
  public parent: IDNode<T> | null;
  public children: IDNode<T>[];
  public body: string;
  public data: T;
  public stub: boolean;
  public custom: any;
  public uri: URI;

  static defaultTitle(fname: string) {
    return _.capitalize(DNodeUtils.basename(fname, true));
  }

  constructor(opts: IDNodeOpts<T>) {
    const {
      id,
      title,
      desc,
      fname,
      type,
      updated,
      created,
      stub,
      body,
      data,
      children,
      custom,
    } = _.defaults(
      opts,
      DNodeRaw.createProps(_.defaults(opts, { parent: null, children: [] }))
    );

    this.id = id;
    this.title = title;
    this.desc = desc;
    this.fname = fname;
    this.type = type;
    this.updated = updated;
    this.created = created;
    this.parent = opts.parent ? opts.parent : null;
    this.children = children;
    this.body = body;
    this.data = data;
    this.stub = stub;
    this.custom = custom;
    this.uri = URI.parse(`dendron://${fname}.md`);
  }

  get domain(): DNode<T> {
    if (this.parent?.id === "root" || _.isNull(this.parent)) {
      return this;
    }
    return this.parent.domain;
  }

  get basename(): string {
    return DNodeUtils.basename(this.logicalPath);
  }

  get detail(): string {
    return "";
  }

  get label(): string {
    return DNodeUtils.isRoot(this) ? "root" : this.logicalPath;
  }

  /**
   * Self and all children
   */
  get nodes(): DNode<T>[] {
    const out: DNode<T>[] = [this as DNode<T>].concat(
      this.children.map((c) => c.nodes).flat()
    );
    return out;
  }

  /**
   * dot delimited path
   *  - for root node, its ""
   *  - for everything else, its the dot delimited name
   *  - used when showing query
   */
  get logicalPath(): string {
    if (this.fname === "root") {
      return "";
    } else {
      return this.fname;
    }
  }

  get path(): string {
    return this.fname;
  }

  addChild(node: IDNode<T>) {
    // only add if new
    if (!this.children.some((ent) => ent.id === node.id)) {
      this.children.push(node);
    }
    // during rename, id will stay the same but parent is set to `null`
    node.parent = this;
  }

  equal(node: IDNode<T>) {
    const props1 = this.toRawProps();
    const props2 = node.toRawProps();
    return _.every([
      _.isEqual(_.omit(props1, "body"), _.omit(props2, "body")),
      _.trim(props1.body) === _.trim(props2.body),
    ]);
  }

  render(): string {
    const { body, meta } = this.toNoteProps();
    return matter.stringify(body || "", meta);
  }

  renderBody(): string {
    return this.body;
  }

  toDocument() {
    return {
      document: {
        nodes: [
          {
            object: "block",
            type: "paragraph",
            nodes: [
              {
                object: "text",
                text: this.renderBody(),
              },
            ],
          },
        ],
      },
    };
  }

  toNoteProps(): NoteProps {
    const node = this;
    const body = this.body;
    const props = _.pick(node, [
      "id",
      "title",
      "desc",
      "updated",
      "created",
      "stub",
    ]);
    const { custom } = node;
    const meta = { ...props, ...custom };
    return {
      meta,
      body,
    };
  }

  toRawProps(hideBody?: boolean, opts?: RawPropsOpts): DNodeRawProps<T> {
    const { ignoreNullParent } = _.defaults(opts, { ignoreNullParent: false });
    const props = _.pick(this, [
      "id",
      "title",
      "desc",
      "type",
      "updated",
      "created",
      "body",
      "fname",
      "data",
      "stub",
      "custom",
    ]);
    let parent;
    if (hideBody) {
      // @ts-ignore
      delete props.body;
    }
    if (this.parent?.title === "root") {
      parent = "root";
    } else if (this.id === "root") {
      parent = null;
    } else {
      // eslint-disable-next-line no-lonely-if
      if (_.isNull(this.parent)) {
        // parent deleted when publishing site
        if (ignoreNullParent || this.id === UNKNOWN_SCHEMA_ID) {
          parent = null;
        } else {
          throw Error(`${props.fname} has no parent node`);
        }
      } else {
        parent = this.parent.id;
      }
    }
    const children = this.children.map((c) => c.id);
    return { ...props, parent, children };
  }

  toRawPropsRecursive(opts?: RawPropsOpts): DNodeRawProps<T>[] {
    const parent: DNodeRawProps<T> = this.toRawProps(false, opts);
    const children: DNodeRawProps<T>[] = this.children
      .map(
        (ch: DNode<T>) =>
          // @ts-ignore
          ch.toRawPropsRecursive(opts)
        // eslint-disable-next-line function-paren-newline
      )
      .flat();
    // @ts-ignore
    const out = [parent].concat(children);
    return out.flat();
  }

  validate(): boolean {
    return true;
  }
}

export class Note extends DNode<NoteData> implements INote {
  public schemaId: string;
  public schema?: Schema;
  public schemaStub: boolean;

  static createStub(fname: string, opts?: Partial<INoteOpts>): Note {
    return new Note({ stub: true, fname, ...opts });
  }

  static createRoot(): Note {
    return new Note({ fname: "root", id: "root", title: "root" });
  }

  /**
   * Create note using props and existing note dict
   * Will merge properties of notes that already exist
   * @param opts
   */
  static fromProps(opts: { props: NoteRawProps; noteDict: NoteDict }) {
    let { props, noteDict } = opts;
    const maybeExisting = noteDict[props.id];
    if (maybeExisting) {
      props = { ...props, ..._.omit(maybeExisting, ["parent", "children"]) };
    }
    if (props.id === "root") {
      return new Note({
        ...props,
        parent: null,
        children: maybeExisting?.children || [],
      });
    }
    const maybeParent = DNodeUtils.findParent({
      hpath: props.fname,
      nodes: noteDict,
    });
    if (_.isUndefined(maybeParent)) {
      throw Error("no parent found");
    }
    return new Note({
      ...props,
      parent: maybeParent as Note,
      children: maybeExisting?.children || [],
    });
  }

  static fromSchema(dirpath: string, schema: Schema): Note {
    const fname = [dirpath, schema.pattern].join(".");
    const note = new Note({
      fname,
      desc: schema.desc,
      schemaStub: true,
      data: { schemaId: schema.id },
    });
    note.schema = schema;
    return note;
  }

  constructor(props: INoteOpts) {
    const cleanProps = _.defaults(props, {
      parent: null,
      children: [],
      schemaStub: false,
    });
    super({
      type: "note",
      ...cleanProps,
    });
    this.schemaId = props?.data?.schemaId || "-1";
    this.schemaStub = cleanProps.schemaStub;
  }

  // vscode detail pane
  get detail(): string {
    if (this.schema && this.schemaStub) {
      return this.schema.desc;
    }
    return this.desc;
  }

  get description(): string | undefined {
    const prefixParts = [];
    if (this.title !== this.fname) {
      prefixParts.push(this.title);
    }
    if (this.stub || this.schemaStub) {
      prefixParts.push("$(gist-new)");
    }
    if (this.schema) {
      // case: unknown schema
      // eslint-disable-next-line no-use-before-define
      if (SchemaUtils.isUnkown(this.schema)) {
        prefixParts.push("$(question)");
        return prefixParts.join(" ");
      }

      // case: recognized schema
      prefixParts.push(`$(repo) ${this.schema.domain.title}`);
      // check if non-domain schema
      if (this.schema.domain.id !== this.schema.id) {
        prefixParts.push("$(breadcrumb-separator)");
        prefixParts.push(this.schema.title);
      }
    }
    return prefixParts.join(" ");
  }

  get domain(): Note {
    return super.domain as Note;
  }

  get url(): string {
    return `/doc/${this.id}`;
  }
}

export class Schema extends DNode<SchemaData> implements ISchema {
  static createRawProps(opts: SchemaRawOptsFlat): SchemaRawProps {
    if (opts.fname.indexOf(".schema") < 0) {
      opts.fname += ".schema";
    }
    const schemaDataOpts: (keyof SchemaData)[] = [
      "namespace",
      "pattern",
      "template",
    ];
    const optsWithoutData = _.omit<SchemaRawOptsFlat, keyof SchemaData>(
      opts,
      schemaDataOpts
    );
    const optsData = _.pick(opts, schemaDataOpts);
    return DNodeRaw.createProps({
      ..._.defaults(optsWithoutData, {
        title: optsWithoutData.id,
        parent: null,
        children: [],
        data: optsData,
      }),
    });
  }

  static createRoot() {
    return new Schema({
      id: "root",
      title: "root",
      fname: "root.schema",
      parent: null,
      children: [],
    });
  }

  static _UNKNOWN_SCHEMA: undefined | Schema = undefined;

  /**
   * This is attached to notes that are part of a domain with schema but
   * don't match any schema in it
   */
  static createUnkownSchema(): Schema {
    if (_.isUndefined(Schema._UNKNOWN_SCHEMA)) {
      const props = Schema.createRawProps({
        id: UNKNOWN_SCHEMA_ID,
        fname: UNKNOWN_SCHEMA_ID,
        stub: true,
        created: "-1",
        updated: "-1",
      });
      Schema._UNKNOWN_SCHEMA = new Schema({
        ...props,
        parent: null,
        children: [],
      });
    }
    return Schema._UNKNOWN_SCHEMA as Schema;
  }

  static defaultTitle(fname: string) {
    return fname.replace(".schema", "");
  }

  constructor(props: ISchemaOpts) {
    if (props.fname.indexOf(".schema") < 0) {
      props.fname += ".schema";
    }
    super({
      type: "schema",
      ..._.defaults(props, {
        id: Schema.defaultTitle(props.fname),
        title: Schema.defaultTitle(props.fname),
        parent: null,
        children: [],
        data: {},
      }),
    });
  }

  get namespace(): boolean {
    return this.data?.namespace || false;
  }

  get label(): string {
    return this.id;
  }

  get logicalPath(): string {
    const part = this.namespace ? `${this.id}/*` : this.id;
    if (this.parent && this.parent.id !== "root") {
      const prefix = this.parent.logicalPath;
      return [prefix, part].join("/");
    } else {
      return part;
    }
  }

  get patternMatch(): string {
    const part = this.namespace ? `${this.pattern}/*` : this.pattern;
    const parent: undefined | Schema = this.parent as Schema;
    if (parent && parent.pattern !== "root") {
      const prefix = parent.patternMatch;
      return [prefix, part].join("/");
    } else {
      return part;
    }
  }

  get pattern(): string {
    return this.data.pattern?.replace(".", "/") || this.id;
  }

  get url(): string {
    return `/schema/${this.id}`;
  }

  match(note: Note): boolean {
    // TODO: simple version
    return this.title === note.basename;
  }

  renderBody() {
    const out = _.map(
      this.toRawPropsRecursive({ ignoreNullParent: true }),
      // TODO: don't hardcode, this only applies to new schemas
      (props) => {
        return {
          ..._.pick(props, ["id", "title", "desc", "data"]),
          parent: "root",
        };
      }
    );
    return YAML.stringify(out, undefined, 4);
  }

  render() {
    const out = _.map(
      this.toRawPropsRecursive({ ignoreNullParent: true }),
      // TODO: don't hardcode, this only applies to new schemas
      (props) => {
        const data = props.data;
        return {
          ..._.pick(props, ["id", "title", "desc"]),
          ...data,
          parent: "root",
        };
      }
    );
    return YAML.stringify(out, undefined, 4);
  }
}

const matchSchemaProps = (
  id: string,
  item: SchemaRawProps,
  props: SchemaRawProps[]
): SchemaRawProps => {
  const out = _.find(props, (p) =>
    _.every([p.id === id, item.fname === p.fname])
  );
  if (_.isUndefined(out)) {
    throw Error(
      `bad schema file. no match found for schema with id ${id}. schema file contents: ${JSON.stringify(
        props
      )}`
    );
  }
  return out;
};

// TODO:move to node
function getRoot(nodes: NoteRawProps[]) {
  // nodes: {nodes}
  const rootNode = _.find(
    nodes,
    (ent) => ent.title === "root" || _.isNull(ent.parent)
  );
  if (!rootNode) {
    throw new DendronError({ msg: "no root node found" });
  }
  const node = new Note({ ...rootNode, parent: null, children: [] });
  return { node, childrenIds: rootNode.children };
}

/**
 * From nodes, return a connected note tree
 */
export class NodeBuilder {
  getDomainsRoot<T extends DNodeData>(
    nodes: DNodeRawProps<T>[]
  ): DNodeRawProps<T>[] {
    return _.filter(nodes, (ent) => ent.parent === "root");
  }

  toNote(item: NoteRawProps, parents: Note[], opts: { schemas: Schema[] }) {
    // _.map(schemas, (v, k) => {
    // });
    const node = new Note({ ...item, parent: null, children: [] });
    // if (node.schemaId) {
    //   node.schema = opts.schemas[node.schemaId];
    // }
    const { parent: parentId, children } = item;
    const parent: Note = _.find(parents, { id: parentId }) as Note;
    // const parent = undefined;
    if (_.isUndefined(parent)) {
      const error = JSON.stringify({
        msg: "no parent found",
        parentId,
        parents: parents.map((p) => _.omit(p.toRawProps(), "body")),
        item: _.omit(item, "body"),
      });
      throw Error(error);
    }
    // NOTE: parents don't get resolved until this is called
    parent.addChild(node);
    let filteredSchemas = opts.schemas;
    const maybeSchema = SchemaUtils.matchNote(node, opts.schemas);
    if (maybeSchema) {
      node.schema = maybeSchema;
    } else {
      node.schema = Schema.createUnkownSchema();
      filteredSchemas = [];
    }
    return { node, parent, children, schemas: filteredSchemas };
  }

  toSchema(item: SchemaRawProps, parent: Schema, props: SchemaRawProps[]) {
    // DEBUG: item: {item}, parents: {parents}
    const node = new Schema({ ...item, parent, children: [] });
    item.children.forEach((chId) => {
      const match = matchSchemaProps(chId, item, props);
      return this.toSchema(match, node, props);
    });
    parent.addChild(node);
    return node;
  }

  buildNoteFromProps(
    props: NoteRawProps[],
    opts: { schemas: Schema[] }
  ): Note[] {
    const { node: rootNode, childrenIds } = getRoot(props);
    const out = [];
    out.push([rootNode]);

    const getNoteFromId = (id: string, props: NoteRawProps[]): NoteRawProps => {
      const nodePropsList = props.filter(
        (ent) => ent.id === id
      ) as NoteRawProps[];
      if (nodePropsList.length > 1) {
        const fnames = nodePropsList.map((ent) => ent.fname).join(", ");
        throw Error(
          `found multiple notes with the same id. please check the following notes: ${fnames}`
        );
      }
      const nodeProps = nodePropsList[0];
      return nodeProps;
    };

    let parentNodes = [rootNode];
    let noteProps: {
      nodeProps: NoteRawProps;
      schemas: Schema[];
    }[] = childrenIds.map((id) => {
      return {
        nodeProps: getNoteFromId(id, props),
        schemas: opts.schemas,
      };
    });

    while (!_.isEmpty(noteProps)) {
      const currentNodes: Note[] = [];

      noteProps = noteProps
        .map(({ nodeProps, schemas }) => {
          // convert note props to note
          const { node, children, schemas: filteredSchemas } = this.toNote(
            nodeProps,
            parentNodes,
            {
              schemas,
            }
          );
          currentNodes.push(node);
          return children.map((id) => {
            return {
              nodeProps: getNoteFromId(id, props),
              schemas: filteredSchemas,
            };
          });
        })
        .flat();
      out.push(currentNodes);
      parentNodes = currentNodes;
    }
    return out.flat();
  }

  buildSchemaFromProps(props: SchemaRawProps[]) {
    const root = Schema.createRoot();
    const rootDomains: SchemaRawProps[] = this.getDomainsRoot<SchemaData>(
      props
    );
    const out = [root];
    rootDomains.forEach((rootRaw) => {
      const domain = this.toSchema(rootRaw, root, props);
      out.push(domain);
      //out = out.concat(domain.nodes as Schema[]);
    });
    // DEBUG ctx: "parseSchema", out:
    return out;
  }
}

function createBackLink(note: Note): NoteLink {
  return {
    type: "note",
    id: "[[" + note.fname + "]]",
  };
}

export class NoteUtils {
  static addBackLink(from: Note, to: Note): void {
    if (_.isUndefined(from.data.links)) {
      from.data.links = [];
    }
    from.data.links.push(createBackLink(to));
  }

  /**
   * @param from
   * @param to
   */
  static createStubNotes(from: Note, to: Note): Note[] {
    const stubNodes: Note[] = [];
    const fromPath = from.logicalPath;
    const toPath = to.logicalPath;
    const index = toPath.indexOf(fromPath) + fromPath.length;
    const diffPath = _.trimStart(toPath.slice(index), ".").split(".");
    let stubPath = fromPath;
    let parent = from;
    // last element is node
    diffPath.slice(0, -1).forEach((part) => {
      // handle starting from root, path = ""
      if (_.isEmpty(stubPath)) {
        stubPath = part;
      } else {
        stubPath += `.${part}`;
      }
      const n = Note.createStub(stubPath);
      stubNodes.push(n);
      parent.addChild(n);
      parent = n;
    });
    parent.addChild(to);
    return stubNodes;
  }
}

export class SchemaUtils {
  static fname(nodePath: string, rmExtension?: boolean) {
    if (rmExtension) {
      const idx = nodePath.lastIndexOf(".yml");
      if (idx > 0) {
        nodePath = nodePath.slice(0, idx);
      }
    }
    // remove trailing dot
    return nodePath.slice(0, nodePath.lastIndexOf("schema") - 1);
  }
  static isUnkown(schema: Schema) {
    return schema.id === UNKNOWN_SCHEMA_ID;
  }

  static applyTemplate(opts: {
    template: SchemaTemplate;
    note: Note;
    engine: DEngine;
  }) {
    const { template, note, engine } = opts;
    if (template.type === "note") {
      const tempNote = _.find(_.values(engine.notes), { fname: template.id });
      if (_.isUndefined(tempNote)) {
        throw Error(`no template found for ${template}`);
      }
      note.body = tempNote.body;
      return true;
    }
    return false;
  }

  /**
   * Return true if template was applied, false otherwise
   * @param opts
   */
  static matchAndApplyTemplate(opts: { note: Note; engine: DEngine }): boolean {
    const { note, engine } = opts;
    const schemas = SchemaUtils.matchNote(note, engine.schemas);
    if (schemas.data.template) {
      return SchemaUtils.applyTemplate({
        template: schemas.data.template,
        note,
        engine,
      });
    } else {
      return false;
    }
  }

  /**
   *
   * @param noteOrPath
   * @param schemas
   * @param opts
   *   - matchNamespace: should match exact namespace note (in addition to wildcard), default: false
   *   - matchPrefix: allow prefix match, default: false
   */
  static matchNote(
    noteOrPath: Note | string,
    schemas: SchemaDict | Schema[],
    opts?: { matchNamespace?: boolean; matchPrefix?: boolean }
  ): Schema {
    const cleanOpts = _.defaults(opts, {
      matchNamespace: true,
      matchPrefix: false,
    });
    const schemaList = _.isArray(schemas) ? schemas : _.values(schemas);
    const notePath = _.isString(noteOrPath) ? noteOrPath : noteOrPath.path;
    const notePathClean = notePath.replace(/\./g, "/");
    let match: Schema | undefined;
    _.find(schemaList, (schemaDomain) => {
      return _.some(schemaDomain.nodes as Schema[], (schema) => {
        const patternMatch = schema.patternMatch;
        if ((schema as Schema).namespace && cleanOpts.matchNamespace) {
          if (minimatch(notePathClean, _.trimEnd(patternMatch, "/*"))) {
            match = schema as Schema;
            return true;
          }
        }
        if (minimatch(notePathClean, patternMatch)) {
          match = schema as Schema;
          return true;
        } else {
          return false;
        }
      });
    });
    if (_.isUndefined(match)) {
      return Schema.createUnkownSchema();
    }
    return match;
  }
}

import {
  actions,
  selectors,
  createStore,
  waitForState,
  makeSource,
  makeFrame
} from "../../utils/test-head";

const { isStepping } = selectors;

let stepInResolve = null;
const mockThreadClient = {
  stepIn: () =>
    new Promise(_resolve => {
      stepInResolve = _resolve;
    }),
  evaluate: () => new Promise(_resolve => {}),
  getFrameScopes: frame => frame.scope,
  sourceContents: sourceId => {
    return new Promise((resolve, reject) => {
      switch (sourceId) {
        case "foo1":
          return resolve({
            source: "function foo1() {\n  return 5;\n}",
            contentType: "text/javascript"
          });
        case "foo":
          return resolve({
            source: "function foo() {\n  return -5;\n}",
            contentType: "text/javascript"
          });
      }
    });
  }
};

function createPauseInfo(overrides = {}) {
  return {
    frames: [makeFrame({ id: 1, sourceId: "foo1" })],
    loadedObjects: [],
    why: {},
    ...overrides
  };
}

describe("pause", () => {
  describe("stepping", () => {
    it("should set and clear the command", async () => {
      const { dispatch, getState } = createStore(mockThreadClient);
      const mockPauseInfo = createPauseInfo();

      await dispatch(actions.newSource(makeSource("foo1")));
      await dispatch(actions.paused(mockPauseInfo));
      const stepped = dispatch(actions.stepIn());
      expect(isStepping(getState())).toBeTruthy();
      await stepInResolve();
      await stepped;
      expect(isStepping(getState())).toBeFalsy();
    });

    it("should only step when paused", async () => {
      const client = { stepIn: jest.fn() };
      const { dispatch } = createStore(client);

      dispatch(actions.stepIn());
      expect(client.stepIn.mock.calls).toHaveLength(0);
    });

    it("should step when paused", async () => {
      const { dispatch, getState } = createStore(mockThreadClient);
      const mockPauseInfo = createPauseInfo();

      await dispatch(actions.newSource(makeSource("foo1")));
      await dispatch(actions.paused(mockPauseInfo));
      dispatch(actions.stepIn());
      expect(isStepping(getState())).toBeTruthy();
    });
  });

  describe("resumed", () => {
    it("should not evaluate expression while stepping", async () => {
      const client = { evaluate: jest.fn() };
      const { dispatch } = createStore(client);

      dispatch(actions.stepIn());
      await dispatch(actions.resumed());
      expect(client.evaluate.mock.calls).toHaveLength(0);
    });

    it("resuming - will re-evaluate watch expressions", async () => {
      const store = createStore(mockThreadClient);
      const { dispatch, getState } = store;
      const mockPauseInfo = createPauseInfo();

      await dispatch(actions.newSource(makeSource("foo1")));
      await dispatch(actions.newSource(makeSource("foo")));
      dispatch(actions.addExpression("foo"));
      await waitForState(store, state => selectors.getExpression(state, "foo"));

      mockThreadClient.evaluate = () => new Promise(r => r("YAY"));
      await dispatch(actions.paused(mockPauseInfo));

      await dispatch(actions.resumed());
      const expression = selectors.getExpression(getState(), "foo");
      expect(expression.value).toEqual("YAY");
    });
  });
});
